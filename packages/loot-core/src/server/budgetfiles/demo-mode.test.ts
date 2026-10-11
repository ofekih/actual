import { beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';

import { DEFAULT_DEMO_MODE_OPTIONS, sanitizeDemoDatabase } from './demo-mode';

beforeEach(global.emptyDatabase());

describe('sanitizeDemoDatabase', () => {
  it('trims transactions and budgets to the requested sample months and sets exact target balances', async () => {
    await db.insertAccount({ id: 'checking', name: 'Checking', offbudget: 0 });
    await db.insertAccount({
      id: 'Chase Card',
      name: 'Chase Sapphire Card',
      offbudget: 0,
    });
    await db.insertAccount({
      id: 'vanguard',
      name: 'Vanguard 401k',
      offbudget: 1,
    });
    await db.insertAccount({
      id: 'closed-acct',
      name: 'Old Bank',
      offbudget: 0,
      closed: 1,
    });

    db.runQuery(
      "INSERT OR REPLACE INTO preferences (id, value) VALUES ('csp-account-types', ?)",
      [
        JSON.stringify({
          checking: 'savings',
          'Chase Card': 'savings',
          vanguard: 'investments',
        }),
      ],
    );

    // Old transaction before sample window (should be deleted)
    await db.insertTransaction({
      id: 'tx-old',
      account: 'checking',
      amount: 50000000, // $500,000 old buildup
      date: '2025-01-15',
      notes: 'Old bonus #income',
    });

    // Closed account transaction (should be deleted)
    await db.insertTransaction({
      id: 'tx-closed',
      account: 'closed-acct',
      amount: 123456,
      date: '2026-09-10',
    });

    // Sample window transactions (Aug, Sep, Oct 2026 for months = 3)
    await db.insertTransaction({
      id: 'tx-aug',
      account: 'checking',
      amount: 800000, // +$8,000 paycheck
      date: '2026-08-15',
      notes: 'Paycheck memo #income',
    });
    await db.insertTransaction({
      id: 'tx-sep',
      account: 'checking',
      amount: -250000, // -$2,500 rent
      date: '2026-09-01',
      notes: 'Rent payment #housing',
    });
    await db.insertTransaction({
      id: 'tx-cc',
      account: 'Chase Card',
      amount: -40000, // -$400 dining
      date: '2026-10-05',
      notes: 'Dinner with friends #dining',
    });

    // Investment account: one real contribution with csp_category, one huge market gain adjustment without category
    db.runQuery(
      "INSERT INTO csp_category_groups (id, name, tombstone) VALUES ('g-inv', 'Investments', 0)",
    );
    db.runQuery(
      "INSERT INTO csp_categories (id, name, cat_group, tombstone) VALUES ('c-401k', '401k', 'g-inv', 0)",
    );
    await db.insertTransaction({
      id: 'tx-inv-contrib',
      account: 'vanguard',
      amount: 100000, // +$1,000 contribution
      date: '2026-09-15',
      csp_category: 'c-401k',
    });
    await db.insertTransaction({
      id: 'tx-inv-reconcile',
      account: 'vanguard',
      amount: 4500000, // +$45,000 market gain adjustment (should be scrubbed)
      date: '2026-09-30',
    });

    sanitizeDemoDatabase(
      {
        months: 3,
        savingsBalance: 1500000, // $15,000
        investmentsBalance: 10000000, // $100,000
        hideClosedAccounts: true,
        stripTransactionNotes: false,
      },
      '2026-10',
    );

    // 1. Closed account should be gone
    const accounts = await db.all<{ id: string }>('SELECT id FROM accounts');
    expect(accounts.map(a => a.id).sort()).toEqual([
      'Chase Card',
      'checking',
      'vanguard',
    ]);

    // 2. No transactions before 2026-08-01
    const minDateRow = db.firstSync<{ minDate: number }>(
      'SELECT MIN(date) as minDate FROM transactions',
    );
    expect(minDateRow?.minDate).toBe(20260801);

    // 3. Total ending balance of checking = $15,000, Chase Card = $0, vanguard = $100,000
    const checkingBal = db.firstSync<{ bal: number }>(
      "SELECT SUM(amount) as bal FROM transactions WHERE acct = 'checking'",
    );
    const ccBal = db.firstSync<{ bal: number }>(
      "SELECT SUM(amount) as bal FROM transactions WHERE acct = 'Chase Card'",
    );
    const vanguardBal = db.firstSync<{ bal: number }>(
      "SELECT SUM(amount) as bal FROM transactions WHERE acct = 'vanguard'",
    );

    expect(checkingBal?.bal).toBe(1500000);
    expect(ccBal?.bal).toBe(0);
    expect(vanguardBal?.bal).toBe(10000000);

    // 4. Notes should be preserved by default (stripTransactionNotes = false)
    const augTx = db.firstSync<{ notes: string }>(
      "SELECT notes FROM transactions WHERE id = 'tx-aug'",
    );
    expect(augTx?.notes).toBe('Paycheck memo #income');
  });

  it('preserves forward-amortized CSP transactions and carries forward effective csp_targets', async () => {
    await db.insertAccount({ id: 'checking', name: 'Checking', offbudget: 0 });

    db.runQuery(
      "INSERT INTO csp_category_groups (id, name, tombstone) VALUES ('g-fixed', 'Fixed Costs', 0)",
    );
    db.runQuery(
      "INSERT INTO csp_categories (id, name, cat_group, moving_average_months, tombstone) VALUES ('c-ins', 'Car Insurance', 'g-fixed', 6, 0)",
    );

    // Target set back in Jan 2026 (before the 3-month window of Aug-Oct 2026)
    db.runQuery(
      "INSERT INTO csp_targets (id, month, category, amount, tombstone) VALUES ('t-1', 202601, 'c-ins', 20000, 0)",
    );

    // 6-month insurance bill paid in June 2026 (covers Jun-Nov 2026, overlapping Aug-Oct)
    await db.insertTransaction({
      id: 'tx-insurance-june',
      account: 'checking',
      amount: -120000,
      date: '2026-06-15',
      csp_category: 'c-ins',
    });

    sanitizeDemoDatabase(
      {
        ...DEFAULT_DEMO_MODE_OPTIONS,
        months: 3,
      },
      '2026-10',
    );

    // The June insurance payment should be preserved on its original date (2026-06-15)
    // so calculateForwardAmortization produces the exact same monthly allocation in Aug-Oct
    const insTx = db.firstSync<{ date: number; amount: number }>(
      "SELECT date, amount FROM transactions WHERE id = 'tx-insurance-june'",
    );
    expect(insTx).toEqual({ date: 20260615, amount: -120000 });

    // The Jan 2026 CSP target should be carried forward to 202608 and older rows deleted
    const targets = await db.all<{ month: number; amount: number }>(
      "SELECT month, amount FROM csp_targets WHERE category = 'c-ins'",
    );
    expect(targets).toEqual([{ month: 202608, amount: 20000 }]);
  });

  it('scales cash flow proportionally when scaleEnabled is true and strips notes when requested', async () => {
    await db.insertAccount({ id: 'checking', name: 'Checking', offbudget: 0 });

    db.runQuery(
      "INSERT INTO csp_category_groups (id, name, tombstone) VALUES ('g-inc', 'Income', 0), ('g-fixed', 'Fixed Costs', 0)",
    );
    db.runQuery(
      "INSERT INTO csp_categories (id, name, cat_group, tombstone) VALUES ('c-pay', 'Paycheck', 'g-inc', 0), ('c-rent', 'Rent', 'g-fixed', 0)",
    );
    // Real monthly income target = $12,000 (1,200,000 cents), Rent target = $3,000 (300,000 cents = 25%)
    db.runQuery(
      "INSERT INTO csp_targets (id, month, category, amount, tombstone) VALUES ('t-inc', 202608, 'c-pay', 1200000, 0), ('t-rent', 202608, 'c-rent', 300000, 0)",
    );

    await db.insertTransaction({
      id: 'tx-pay',
      account: 'checking',
      amount: 1200000,
      date: '2026-09-01',
      csp_category: 'c-pay',
      notes: 'Direct deposit from Acme Corp #income',
    });
    await db.insertTransaction({
      id: 'tx-rent',
      account: 'checking',
      amount: -300000,
      date: '2026-09-02',
      csp_category: 'c-rent',
      notes: 'Apartment 4B rent',
    });

    // Scale to $6,000/mo (600,000 cents => scale factor = 0.5) and strip notes
    sanitizeDemoDatabase(
      {
        ...DEFAULT_DEMO_MODE_OPTIONS,
        months: 3,
        scaleEnabled: true,
        targetMonthlyIncome: 600000,
        stripTransactionNotes: true,
      },
      '2026-10',
    );

    const payTx = db.firstSync<{ amount: number; notes: string | null }>(
      "SELECT amount, notes FROM transactions WHERE id = 'tx-pay'",
    );
    const rentTx = db.firstSync<{ amount: number; notes: string | null }>(
      "SELECT amount, notes FROM transactions WHERE id = 'tx-rent'",
    );

    expect(payTx).toEqual({ amount: 600000, notes: '#income' });
    expect(rentTx).toEqual({ amount: -150000, notes: null });

    const rentTarget = db.firstSync<{ amount: number }>(
      "SELECT amount FROM csp_targets WHERE category = 'c-rent'",
    );
    expect(rentTarget?.amount).toBe(150000); // 25% of $6,000 = $1,500
  });

  it('keeps asset accounts, their pre-cutoff history, balances, and notes completely untouched', async () => {
    await db.insertAccount({ id: 'checking', name: 'Checking', offbudget: 0 });
    await db.insertAccount({
      id: 'mazda',
      name: 'Mazda CX-5',
      offbudget: 1,
    });

    db.runQuery(
      "INSERT OR REPLACE INTO preferences (id, value) VALUES ('csp-account-types', ?)",
      [
        JSON.stringify({
          checking: 'savings',
          mazda: 'assets',
        }),
      ],
    );

    // Asset valuation recorded a year ago + depreciation adjustment
    await db.insertTransaction({
      id: 'tx-car-initial',
      account: 'mazda',
      amount: 2800000, // $28,000
      date: '2025-05-01',
      notes: 'Initial Autohub valuation',
      starting_balance_flag: true,
    });
    await db.insertTransaction({
      id: 'tx-car-depr',
      account: 'mazda',
      amount: -150000, // -$1,500 depreciation
      date: '2026-09-01',
      notes: 'Autohub market adjustment',
    });

    sanitizeDemoDatabase(
      {
        ...DEFAULT_DEMO_MODE_OPTIONS,
        months: 3,
        scaleEnabled: true,
        targetMonthlyIncome: 600000,
        stripTransactionNotes: true,
      },
      '2026-10',
    );

    const carTxs = await db.all<{
      id: string;
      amount: number;
      date: number;
      notes: string | null;
    }>(
      "SELECT id, amount, date, notes FROM transactions WHERE acct = 'mazda' ORDER BY date ASC",
    );

    expect(carTxs).toEqual([
      {
        id: 'tx-car-initial',
        amount: 2800000,
        date: 20250501,
        notes: 'Initial Autohub valuation',
      },
      {
        id: 'tx-car-depr',
        amount: -150000,
        date: 20260901,
        notes: 'Autohub market adjustment',
      },
    ]);
  });
});
