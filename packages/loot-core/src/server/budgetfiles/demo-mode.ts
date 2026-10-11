import { v4 as uuidv4 } from 'uuid';

import * as db from '#server/db';
import * as monthUtils from '#shared/months';
import type { DemoModeOptions } from '#types/prefs';

export const DEFAULT_DEMO_MODE_OPTIONS: DemoModeOptions = {
  months: 3,
  scaleEnabled: false,
  targetMonthlyIncome: 600000, // $6,000.00
  savingsBalance: 1500000, // $15,000.00
  investmentsBalance: 10000000, // $100,000.00
  debtBalance: 0,
  hideClosedAccounts: true,
  stripTransactionNotes: false,
};

type CspAccountCategory = 'savings' | 'debt' | 'investments' | 'assets';

const CREDIT_CARD_NAME_PATTERN =
  /credit|card|amex|visa|mastercard|discover|sapphire|freedom|citi|capital\s*one|bilt/i;

function getAccountCspCategory(
  account: { id: string; offbudget: number | null },
  accountTypes: Record<string, string>,
): CspAccountCategory {
  const type = accountTypes[account.id];
  if (
    type === 'savings' ||
    type === 'debt' ||
    type === 'investments' ||
    type === 'assets'
  ) {
    return type;
  }
  if (type === 'auto') {
    return 'assets';
  }
  return (account.offbudget ?? 0) === 0 ? 'savings' : 'assets';
}

function distributeGroupBalance(
  accountIds: string[],
  targetTotal: number,
): Map<string, number> {
  const result = new Map<string, number>();
  const count = accountIds.length;
  if (count === 0) {
    return result;
  }
  if (count === 1) {
    result.set(accountIds[0], targetTotal);
    return result;
  }

  // Round shares to clean $100 (10,000 cent) increments when possible
  const step = Math.abs(targetTotal) >= count * 10000 ? 10000 : 100;
  const baseShare = Math.trunc(targetTotal / count / step) * step;
  let allocated = 0;

  for (let i = 1; i < count; i++) {
    result.set(accountIds[i], baseShare);
    allocated += baseShare;
  }
  result.set(accountIds[0], targetTotal - allocated);

  return result;
}

function ensureStartingBalancePayee(): string {
  const existing = db.firstSync<{ id: string }>(
    "SELECT id FROM payees WHERE name = 'Starting Balance' AND IFNULL(tombstone, 0) = 0 LIMIT 1",
  );
  if (existing) {
    db.runQuery(
      'INSERT OR IGNORE INTO payee_mapping (id, targetId) VALUES (?, ?)',
      [existing.id, existing.id],
    );
    return existing.id;
  }

  const id = uuidv4();
  db.runQuery('INSERT INTO payees (id, name, tombstone) VALUES (?, ?, 0)', [
    id,
    'Starting Balance',
  ]);
  db.runQuery(
    'INSERT OR REPLACE INTO payee_mapping (id, targetId) VALUES (?, ?)',
    [id, id],
  );
  return id;
}

function ensureStartingBalanceCategory(): string | null {
  const existing = db.firstSync<{ id: string }>(
    "SELECT id FROM categories WHERE name = 'Starting Balances' AND IFNULL(tombstone, 0) = 0 LIMIT 1",
  );
  if (existing) {
    db.runQuery(
      'INSERT OR IGNORE INTO category_mapping (id, transferId) VALUES (?, ?)',
      [existing.id, existing.id],
    );
    return existing.id;
  }

  const incomeCategory = db.firstSync<{ id: string }>(
    'SELECT id FROM categories WHERE is_income = 1 AND IFNULL(tombstone, 0) = 0 ORDER BY sort_order ASC LIMIT 1',
  );
  if (incomeCategory) {
    db.runQuery(
      'INSERT OR IGNORE INTO category_mapping (id, transferId) VALUES (?, ?)',
      [incomeCategory.id, incomeCategory.id],
    );
    return incomeCategory.id;
  }

  return null;
}

function computeBaselineMonthlyIncome(
  cutoffMonthInt: number,
  cutoffDateInt: number,
  months: number,
): number {
  try {
    const cspIncomeCategories = db.runQuery<{ id: string }>(
      `SELECT c.id
       FROM csp_categories c
       JOIN csp_category_groups g ON c.cat_group = g.id
       WHERE LOWER(g.name) LIKE '%income%'
         AND IFNULL(c.tombstone, 0) = 0
         AND IFNULL(g.tombstone, 0) = 0`,
      [],
      true,
    );

    if (cspIncomeCategories.length > 0) {
      const ids = cspIncomeCategories.map(c => c.id);
      const placeholders = ids.map(() => '?').join(', ');

      // 1. Prefer CSP target income sum
      const targetRows = db.runQuery<{ category: string; amount: number }>(
        `SELECT category, amount FROM (
           SELECT category, amount, month,
             ROW_NUMBER() OVER(PARTITION BY category ORDER BY month DESC) as rn
           FROM csp_targets
           WHERE category IN (${placeholders}) AND IFNULL(tombstone, 0) = 0
         ) WHERE rn = 1`,
        ids,
        true,
      );
      const targetSum = targetRows.reduce(
        (sum, r) => sum + Math.abs(r.amount || 0),
        0,
      );
      if (targetSum > 0) {
        return targetSum;
      }

      // 2. Fall back to average monthly actuals in CSP income categories
      const actualRow = db.firstSync<{ total: number | null }>(
        `SELECT SUM(t.amount) as total
         FROM transactions t
         JOIN accounts a ON a.id = t.acct
         WHERE t.csp_category IN (${placeholders})
           AND t.date >= ?
           AND t.isParent = 0
           AND IFNULL(t.tombstone, 0) = 0
           AND IFNULL(a.offbudget, 0) = 0`,
        [...ids, cutoffDateInt],
      );
      if (actualRow?.total && Math.abs(actualRow.total) > 0) {
        return Math.round(Math.abs(actualRow.total) / months);
      }
    }
  } catch {
    // csp tables may not exist in older schemas
  }

  // 3. Fallback: average monthly positive inflows in on-budget accounts
  const inflowRow = db.firstSync<{ total: number | null }>(
    `SELECT SUM(t.amount) as total
     FROM transactions t
     JOIN accounts a ON a.id = t.acct
     WHERE t.date >= ?
       AND t.isParent = 0
       AND IFNULL(t.tombstone, 0) = 0
       AND IFNULL(t.starting_balance_flag, 0) = 0
       AND t.transferred_id IS NULL
       AND IFNULL(a.offbudget, 0) = 0
       AND t.amount > 0`,
    [cutoffDateInt],
  );
  if (inflowRow?.total && inflowRow.total > 0) {
    return Math.round(inflowRow.total / months);
  }

  void cutoffMonthInt;
  return 0;
}

function sanitizeMonteCarloJson(
  rawJson: string,
  accountBalances: Map<string, number>,
  totalInvestmentsBalance: number,
  scaleFactor: number,
): string | null {
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if (Array.isArray(parsed.pots)) {
      const ordinaryPots = parsed.pots.filter(
        (p: Record<string, unknown>) => !p?.isSurplus,
      );
      const fallbackShare =
        ordinaryPots.length > 0
          ? Math.round(totalInvestmentsBalance / ordinaryPots.length)
          : totalInvestmentsBalance;

      parsed.pots = parsed.pots.map((pot: Record<string, unknown>) => {
        if (!pot || typeof pot !== 'object') return pot;
        if (pot.isSurplus) {
          return { ...pot, startingBalance: 0 };
        }
        if (
          typeof pot.accountId === 'string' &&
          accountBalances.has(pot.accountId)
        ) {
          return {
            ...pot,
            startingBalance: Math.max(
              0,
              accountBalances.get(pot.accountId) ?? 0,
            ),
          };
        }
        return {
          ...pot,
          startingBalance: Math.max(0, fallbackShare),
        };
      });
    }

    if (scaleFactor !== 1) {
      if (Array.isArray(parsed.contributions)) {
        parsed.contributions = parsed.contributions.map(
          (c: Record<string, unknown>) =>
            c && typeof c.annualAmount === 'number'
              ? { ...c, annualAmount: Math.round(c.annualAmount * scaleFactor) }
              : c,
        );
      }
      if (Array.isArray(parsed.spendingPhases)) {
        parsed.spendingPhases = parsed.spendingPhases.map(
          (s: Record<string, unknown>) =>
            s && typeof s.annualWithdrawal === 'number'
              ? {
                  ...s,
                  annualWithdrawal: Math.round(
                    s.annualWithdrawal * scaleFactor,
                  ),
                }
              : s,
        );
      }
      if (Array.isArray(parsed.incomeStreams)) {
        parsed.incomeStreams = parsed.incomeStreams.map(
          (inc: Record<string, unknown>) =>
            inc && typeof inc.annualAmount === 'number'
              ? {
                  ...inc,
                  annualAmount: Math.round(inc.annualAmount * scaleFactor),
                }
              : inc,
        );
      }
    }

    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}

export function normalizeDemoModeOptions(
  rawOptions?: Partial<DemoModeOptions>,
): DemoModeOptions {
  return {
    months: Math.max(
      1,
      Math.min(
        24,
        Math.round(rawOptions?.months ?? DEFAULT_DEMO_MODE_OPTIONS.months),
      ),
    ),
    scaleEnabled:
      rawOptions?.scaleEnabled ?? DEFAULT_DEMO_MODE_OPTIONS.scaleEnabled,
    targetMonthlyIncome:
      rawOptions?.targetMonthlyIncome ??
      DEFAULT_DEMO_MODE_OPTIONS.targetMonthlyIncome,
    savingsBalance:
      rawOptions?.savingsBalance ?? DEFAULT_DEMO_MODE_OPTIONS.savingsBalance,
    investmentsBalance:
      rawOptions?.investmentsBalance ??
      DEFAULT_DEMO_MODE_OPTIONS.investmentsBalance,
    debtBalance:
      rawOptions?.debtBalance ?? DEFAULT_DEMO_MODE_OPTIONS.debtBalance,
    hideClosedAccounts:
      rawOptions?.hideClosedAccounts ??
      DEFAULT_DEMO_MODE_OPTIONS.hideClosedAccounts,
    stripTransactionNotes:
      rawOptions?.stripTransactionNotes ??
      DEFAULT_DEMO_MODE_OPTIONS.stripTransactionNotes,
  };
}

export function sanitizeDemoDatabase(
  rawOptions?: Partial<DemoModeOptions>,
  referenceMonth?: string,
): DemoModeOptions {
  const options = normalizeDemoModeOptions(rawOptions);
  const currentMonth = referenceMonth || monthUtils.currentMonth();
  const cutoffMonth = monthUtils.subMonths(currentMonth, options.months - 1);
  const cutoffMonthInt = parseInt(cutoffMonth.replace('-', ''), 10);
  const cutoffDateInt = cutoffMonthInt * 100 + 1;

  db.transaction(() => {
    // 1. Remove closed accounts if requested
    if (options.hideClosedAccounts) {
      db.runQuery(
        'DELETE FROM transactions WHERE acct IN (SELECT id FROM accounts WHERE closed = 1 OR IFNULL(tombstone, 0) = 1)',
      );
      db.runQuery(
        'UPDATE transactions SET transferred_id = NULL WHERE transferred_id IS NOT NULL AND transferred_id NOT IN (SELECT id FROM transactions)',
      );
      db.runQuery(
        'DELETE FROM accounts WHERE closed = 1 OR IFNULL(tombstone, 0) = 1',
      );
      db.runQuery(
        'DELETE FROM payees WHERE transfer_acct IS NOT NULL AND transfer_acct NOT IN (SELECT id FROM accounts)',
      );
    }

    // Read CSP account classifications up front so asset accounts stay untouched
    let accountTypes: Record<string, string> = {};
    const accountTypesPref = db.firstSync<{ value: string }>(
      "SELECT value FROM preferences WHERE id = 'csp-account-types'",
    );
    if (accountTypesPref?.value) {
      try {
        accountTypes = JSON.parse(accountTypesPref.value);
      } catch {
        accountTypes = {};
      }
    }

    const openAccounts = db.runQuery<{
      id: string;
      name: string;
      offbudget: number | null;
    }>(
      'SELECT id, name, offbudget FROM accounts WHERE IFNULL(closed, 0) = 0 AND IFNULL(tombstone, 0) = 0 ORDER BY sort_order, name',
      [],
      true,
    );

    const assetAccountIds = openAccounts
      .filter(acc => getAccountCspCategory(acc, accountTypes) === 'assets')
      .map(acc => acc.id);
    const assetAccountIdSet = new Set(assetAccountIds);
    const notAssetAccountClause =
      assetAccountIds.length > 0
        ? ` AND acct NOT IN (${assetAccountIds.map(() => '?').join(', ')})`
        : '';

    // 2. Identify amortized CSP categories (moving_average_months > 0) and preserve
    //    their on-budget transactions across the full audit lookback window on their
    //    original dates so CSP Planned/Actual numbers remain 100% unchanged.
    let amortizedCategoryIds: string[] = [];
    let earliestAmortizedDateInt = cutoffDateInt;
    try {
      const amortizedCats = db.runQuery<{
        id: string;
        moving_average_months: number;
      }>(
        'SELECT id, moving_average_months FROM csp_categories WHERE IFNULL(moving_average_months, 0) > 0 AND IFNULL(tombstone, 0) = 0',
        [],
        true,
      );

      if (amortizedCats.length > 0) {
        amortizedCategoryIds = amortizedCats.map(c => c.id);
        let maxWindow = 12;
        for (const cat of amortizedCats) {
          if (cat.moving_average_months > maxWindow) {
            maxWindow = cat.moving_average_months;
          }
        }
        const earliestAuditMonth = monthUtils.subMonths(
          cutoffMonth,
          maxWindow * 2,
        );
        earliestAmortizedDateInt =
          parseInt(earliestAuditMonth.replace('-', ''), 10) * 100 + 1;

        // If any pre-cutoff transaction in an amortized category is a split child,
        // detach it from its parent before pre-cutoff parents are deleted.
        const catPlaceholders = amortizedCategoryIds.map(() => '?').join(', ');
        db.runQuery(
          `UPDATE transactions
           SET isChild = 0, parent_id = NULL
           WHERE date >= ? AND date < ?
             AND isChild = 1
             AND csp_category IN (${catPlaceholders})`,
          [earliestAmortizedDateInt, cutoffDateInt, ...amortizedCategoryIds],
        );
      }
    } catch {
      // csp_categories table may not exist
    }

    // 3. Delete pre-cutoff transactions (except on asset accounts and amortized CSP categories within lookback)
    if (amortizedCategoryIds.length > 0) {
      const catPlaceholders = amortizedCategoryIds.map(() => '?').join(', ');
      db.runQuery(
        `DELETE FROM transactions
         WHERE date < ?
           AND NOT (
             date >= ?
             AND csp_category IN (${catPlaceholders})
             AND IFNULL(isParent, 0) = 0
           )${notAssetAccountClause}`,
        [
          cutoffDateInt,
          earliestAmortizedDateInt,
          ...amortizedCategoryIds,
          ...assetAccountIds,
        ],
      );
    } else {
      db.runQuery(
        `DELETE FROM transactions WHERE date < ?${notAssetAccountClause}`,
        [cutoffDateInt, ...assetAccountIds],
      );
    }
    db.runQuery(
      'DELETE FROM transactions WHERE isChild = 1 AND (parent_id IS NULL OR parent_id NOT IN (SELECT id FROM transactions))',
    );
    db.runQuery(
      'DELETE FROM transactions WHERE isParent = 1 AND id NOT IN (SELECT DISTINCT parent_id FROM transactions WHERE isChild = 1 AND parent_id IS NOT NULL)',
    );
    db.runQuery(
      'UPDATE transactions SET transferred_id = NULL WHERE transferred_id IS NOT NULL AND transferred_id NOT IN (SELECT id FROM transactions)',
    );

    // 4. Carry forward effective csp_targets to cutoffMonthInt and delete older rows
    try {
      const effectiveTargets = db.runQuery<{
        category: string;
        amount: number;
      }>(
        `SELECT category, amount FROM (
           SELECT category, amount, month,
             ROW_NUMBER() OVER(PARTITION BY category ORDER BY month DESC) as rn
           FROM csp_targets
           WHERE month <= ? AND IFNULL(tombstone, 0) = 0
         ) WHERE rn = 1`,
        [cutoffMonthInt],
        true,
      );

      db.runQuery('DELETE FROM csp_targets WHERE month < ?', [cutoffMonthInt]);

      for (const row of effectiveTargets) {
        const existingAtCutoff = db.firstSync<{ id: string }>(
          'SELECT id FROM csp_targets WHERE category = ? AND month = ?',
          [row.category, cutoffMonthInt],
        );
        if (existingAtCutoff) {
          db.runQuery(
            'UPDATE csp_targets SET amount = ?, tombstone = 0 WHERE id = ?',
            [row.amount, existingAtCutoff.id],
          );
        } else {
          db.runQuery(
            'INSERT INTO csp_targets (id, month, category, amount, tombstone) VALUES (?, ?, ?, ?, 0)',
            [uuidv4(), cutoffMonthInt, row.category, row.amount],
          );
        }
      }
    } catch {
      // csp_targets table may not exist
    }

    // 5. Trim envelope & tracking budgets prior to cutoffMonthInt
    db.runQuery('DELETE FROM zero_budgets WHERE month < ?', [cutoffMonthInt]);
    db.runQuery('DELETE FROM reflect_budgets WHERE month < ?', [
      cutoffMonthInt,
    ]);
    db.runQuery('DELETE FROM zero_budget_months WHERE id < ?', [cutoffMonth]);
    db.runQuery('UPDATE zero_budget_months SET buffered = 0 WHERE id = ?', [
      cutoffMonth,
    ]);

    // 6. Remove existing starting balances / investment market value reconciliations
    //    on non-asset accounts
    db.runQuery(
      `DELETE FROM transactions WHERE starting_balance_flag = 1${notAssetAccountClause}`,
      assetAccountIds,
    );

    const investmentAccountIds = openAccounts
      .filter(acc => getAccountCspCategory(acc, accountTypes) === 'investments')
      .map(acc => acc.id);

    if (investmentAccountIds.length > 0) {
      const placeholders = investmentAccountIds.map(() => '?').join(', ');
      db.runQuery(
        `DELETE FROM transactions
         WHERE acct IN (${placeholders})
           AND transferred_id IS NULL
           AND csp_category IS NULL
           AND category IS NULL
           AND IFNULL(isParent, 0) = 0
           AND IFNULL(isChild, 0) = 0`,
        investmentAccountIds,
      );
    }

    // 7. Scale cash flow if enabled (excluding asset accounts)
    let scaleFactor = 1;
    if (options.scaleEnabled && options.targetMonthlyIncome > 0) {
      const baselineIncome = computeBaselineMonthlyIncome(
        cutoffMonthInt,
        cutoffDateInt,
        options.months,
      );
      if (baselineIncome > 0) {
        scaleFactor = options.targetMonthlyIncome / baselineIncome;

        db.runQuery(
          `UPDATE transactions SET amount = CAST(ROUND(amount * ?) AS INTEGER) WHERE IFNULL(isParent, 0) = 0${notAssetAccountClause}`,
          [scaleFactor, ...assetAccountIds],
        );
        db.runQuery(
          `UPDATE transactions
           SET amount = IFNULL(
             (SELECT SUM(c.amount) FROM transactions c WHERE c.parent_id = transactions.id AND IFNULL(c.tombstone, 0) = 0),
             0
           )
           WHERE isParent = 1${notAssetAccountClause}`,
          assetAccountIds,
        );

        try {
          db.runQuery(
            'UPDATE csp_targets SET amount = CAST(ROUND(amount * ?) AS INTEGER)',
            [scaleFactor],
          );
          db.runQuery(
            'UPDATE csp_categories SET planned_amount = CAST(ROUND(planned_amount * ?) AS INTEGER) WHERE planned_amount IS NOT NULL',
            [scaleFactor],
          );
        } catch {
          // ignore if csp tables absent
        }

        db.runQuery(
          `UPDATE zero_budgets
           SET amount = CAST(ROUND(amount * ?) AS INTEGER),
               goal = CASE WHEN goal IS NOT NULL THEN CAST(ROUND(goal * ?) AS INTEGER) ELSE NULL END`,
          [scaleFactor, scaleFactor],
        );
        db.runQuery(
          `UPDATE reflect_budgets
           SET amount = CAST(ROUND(amount * ?) AS INTEGER),
               goal = CASE WHEN goal IS NOT NULL THEN CAST(ROUND(goal * ?) AS INTEGER) ELSE NULL END`,
          [scaleFactor, scaleFactor],
        );
        db.runQuery(
          'UPDATE zero_budget_months SET buffered = CAST(ROUND(buffered * ?) AS INTEGER)',
          [scaleFactor],
        );
      }
    }

    // 8. Compute target ending balances per non-asset account and insert synthetic Starting Balances
    const groupedAccounts: Record<
      CspAccountCategory,
      Array<{ id: string; name: string; offbudget: number | null }>
    > = {
      savings: [],
      investments: [],
      assets: [],
      debt: [],
    };

    for (const acc of openAccounts) {
      groupedAccounts[getAccountCspCategory(acc, accountTypes)].push(acc);
    }

    const targetAccountBalances = new Map<string, number>();

    // For savings, prefer assigning the positive cash balance to non-credit-card accounts
    const savingsAccounts = groupedAccounts.savings;
    const cashSavingsAccounts = savingsAccounts.filter(
      a => !CREDIT_CARD_NAME_PATTERN.test(a.name),
    );
    const creditCardSavingsAccounts = savingsAccounts.filter(a =>
      CREDIT_CARD_NAME_PATTERN.test(a.name),
    );

    if (cashSavingsAccounts.length > 0) {
      const dist = distributeGroupBalance(
        cashSavingsAccounts.map(a => a.id),
        options.savingsBalance,
      );
      for (const [id, bal] of dist) {
        targetAccountBalances.set(id, bal);
      }
      for (const cc of creditCardSavingsAccounts) {
        targetAccountBalances.set(cc.id, 0);
      }
    } else {
      const dist = distributeGroupBalance(
        savingsAccounts.map(a => a.id),
        options.savingsBalance,
      );
      for (const [id, bal] of dist) {
        targetAccountBalances.set(id, bal);
      }
    }

    for (const [id, bal] of distributeGroupBalance(
      groupedAccounts.investments.map(a => a.id),
      options.investmentsBalance,
    )) {
      targetAccountBalances.set(id, bal);
    }

    const normalizedDebtTotal =
      options.debtBalance === 0 ? 0 : -Math.abs(options.debtBalance);
    for (const [id, bal] of distributeGroupBalance(
      groupedAccounts.debt.map(a => a.id),
      normalizedDebtTotal,
    )) {
      targetAccountBalances.set(id, bal);
    }

    const startingBalancePayeeId = ensureStartingBalancePayee();
    const startingBalanceCategoryId = ensureStartingBalanceCategory();

    for (const acc of openAccounts) {
      // Leave asset accounts completely untouched
      if (assetAccountIdSet.has(acc.id)) {
        continue;
      }

      const targetBalance = targetAccountBalances.get(acc.id) ?? 0;
      const flowRow = db.firstSync<{ netFlow: number | null }>(
        `SELECT SUM(amount) as netFlow
         FROM transactions
         WHERE acct = ?
           AND IFNULL(isParent, 0) = 0
           AND IFNULL(tombstone, 0) = 0`,
        [acc.id],
      );
      const netFlow = flowRow?.netFlow ?? 0;
      const startingAmount = targetBalance - netFlow;

      if (startingAmount !== 0) {
        const isOnBudget = (acc.offbudget ?? 0) === 0;
        db.runQuery(
          `INSERT INTO transactions (
             id, acct, amount, date, description, category,
             starting_balance_flag, cleared, reconciled, tombstone,
             isParent, isChild, sort_order
           ) VALUES (?, ?, ?, ?, ?, ?, 1, 1, 1, 0, 0, 0, 1)`,
          [
            uuidv4(),
            acc.id,
            startingAmount,
            cutoffDateInt,
            startingBalancePayeeId,
            isOnBudget ? startingBalanceCategoryId : null,
          ],
        );
      }
    }

    // 9. Strip transaction notes (preserving #tags) if enabled, excluding asset accounts
    if (options.stripTransactionNotes) {
      const rows = db.runQuery<{ id: string; notes: string }>(
        `SELECT id, notes FROM transactions WHERE notes IS NOT NULL AND notes != ''${notAssetAccountClause}`,
        assetAccountIds,
        true,
      );
      for (const row of rows) {
        const tags = row.notes.match(/#[^\s#]+/g);
        const sanitizedNote = tags && tags.length > 0 ? tags.join(' ') : null;
        db.runQuery('UPDATE transactions SET notes = ? WHERE id = ?', [
          sanitizedNote,
          row.id,
        ]);
      }
    }

    // 10. Sanitize saved Monte Carlo configurations in preferences & dashboard
    const mcPref = db.firstSync<{ value: string }>(
      "SELECT value FROM preferences WHERE id = 'csp-monte-carlo-config'",
    );
    if (mcPref?.value) {
      const updated = sanitizeMonteCarloJson(
        mcPref.value,
        targetAccountBalances,
        options.investmentsBalance,
        scaleFactor,
      );
      if (updated) {
        db.runQuery(
          "UPDATE preferences SET value = ? WHERE id = 'csp-monte-carlo-config'",
          [updated],
        );
      }
    }

    try {
      const mcWidgets = db.runQuery<{ id: string; meta: string | null }>(
        "SELECT id, meta FROM dashboard WHERE type = 'monte-carlo-card' AND meta IS NOT NULL",
        [],
        true,
      );
      for (const widget of mcWidgets) {
        if (widget.meta) {
          const updated = sanitizeMonteCarloJson(
            widget.meta,
            targetAccountBalances,
            options.investmentsBalance,
            scaleFactor,
          );
          if (updated) {
            db.runQuery('UPDATE dashboard SET meta = ? WHERE id = ?', [
              updated,
              widget.id,
            ]);
          }
        }
      }
    } catch {
      // dashboard table may not exist
    }

    // 11. Clear spreadsheet cache & CRDT logs in the demo clone
    try {
      db.runQuery('DELETE FROM kvcache');
      db.runQuery('DELETE FROM kvcache_key');
    } catch {
      // cache tables may not exist yet
    }
    try {
      db.runQuery('DELETE FROM messages_crdt');
      db.runQuery('DELETE FROM messages_pending');
    } catch {
      // ignore
    }
  });

  return options;
}
