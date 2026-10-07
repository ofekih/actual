import { describe, expect, it } from 'vitest';

import {
  createContributionsFromCsp,
  createPotsFromCspAccounts,
  createRetirementSpendingFromCsp,
  inferTaxSettingsForAccount,
} from './cspPotsAndContributions';
import type {
  CspInvestmentAccount,
  CspInvestmentCategory,
  CspLivingExpenses,
} from './types';

describe('cspPotsAndContributions', () => {
  const mockAccounts: CspInvestmentAccount[] = [
    { id: 'acc-1', name: 'Roth IRA', balance: 50000, type: 'investment' },
    { id: 'acc-2', name: '401k', balance: 150000, type: 'investment' },
  ];

  const mockCategories: CspInvestmentCategory[] = [
    {
      id: 'cat-1',
      name: 'Roth IRA',
      groupId: 'grp-inv',
      groupName: 'Investments',
      annualPlanned: 7000,
      monthlyTarget: 583.33,
      trailing12MonthActual: 6500,
    },
    {
      id: 'cat-2',
      name: '401k match',
      groupId: 'grp-inv',
      groupName: 'Investments',
      annualPlanned: 20000,
      monthlyTarget: 1666.66,
      trailing12MonthActual: 22000,
    },
  ];

  const mockExpenses: CspLivingExpenses = {
    fixedCostsMonthly: 3000,
    guiltFreeMonthly: 1000,
    totalMonthly: 4000,
    totalAnnual: 48000,
  };

  it('creates pots from CSP investment accounts', () => {
    const pots = createPotsFromCspAccounts(mockAccounts);
    // Surplus pot is always index 0
    expect(pots[0].isSurplus).toBe(true);

    // Two account pots
    expect(pots.length).toBe(3);
    expect(pots[1].name).toBe('Roth IRA');
    expect(pots[1].startingBalance).toBe(50000);
    expect(pots[1].accountId).toBe('acc-1');

    expect(pots[2].name).toBe('401k');
    expect(pots[2].startingBalance).toBe(150000);
    expect(pots[2].accountId).toBe('acc-2');
  });

  it('updates existing pots while preserving their settings', () => {
    const initialPots = createPotsFromCspAccounts(mockAccounts);
    // Modify one pot's return setting
    initialPots[1].expectedReturnMean = 0.09;

    const updatedAccounts: CspInvestmentAccount[] = [
      { id: 'acc-1', name: 'Roth IRA', balance: 60000, type: 'investment' },
      { id: 'acc-2', name: '401k', balance: 175000, type: 'investment' },
    ];

    const updatedPots = createPotsFromCspAccounts(updatedAccounts, initialPots);
    expect(updatedPots[1].startingBalance).toBe(60000);
    expect(updatedPots[1].expectedReturnMean).toBe(0.09);
    expect(updatedPots[2].startingBalance).toBe(175000);
  });

  it('creates contributions from CSP categories and links by name to pots', () => {
    const pots = createPotsFromCspAccounts(mockAccounts);
    const contributions = createContributionsFromCsp(
      mockCategories,
      pots,
      2050,
      false,
    );

    expect(contributions.length).toBe(2);
    expect(contributions[0].name).toBe('Roth IRA');
    expect(contributions[0].annualAmount).toBe(7000);
    expect(contributions[0].toAge).toBe(2050);
    expect(contributions[0].potId).toBe(pots[1].id);
    expect(contributions[0].cspCategoryId).toBe('cat-1');

    expect(contributions[1].name).toBe('401k match');
    expect(contributions[1].annualAmount).toBe(20000);
    expect(contributions[1].toAge).toBe(2050);
    expect(contributions[1].potId).toBe(pots[2].id);
  });

  it('uses trailing 12-month actuals when requested', () => {
    const pots = createPotsFromCspAccounts(mockAccounts);
    const contributions = createContributionsFromCsp(
      mockCategories,
      pots,
      2050,
      true,
    );

    expect(contributions[0].annualAmount).toBe(6500);
    expect(contributions[1].annualAmount).toBe(22000);
  });

  it('creates retirement spending phases from living expenses with multiplier', () => {
    const phases = createRetirementSpendingFromCsp(mockExpenses, 2045, 0.8);
    expect(phases.length).toBe(2);
    expect(phases[0].name).toBe('Accumulation (pre-retirement)');
    expect(phases[0].fromAge).toBeNull();
    expect(phases[0].annualWithdrawal).toBe(0);
    expect(phases[1].name).toBe('Retirement living expenses');
    expect(phases[1].fromAge).toBe(2045);
    expect(phases[1].annualWithdrawal).toBe(Math.round(48000 * 0.8));
  });

  it('infers realistic tax settings for different account types', () => {
    // Roth accounts: 0% tax, 0% taxable
    expect(inferTaxSettingsForAccount('Roth IRA')).toEqual({
      withdrawalTaxRate: 0,
      taxableFraction: 0,
    });
    expect(
      inferTaxSettingsForAccount('Gina Nicole Kofman - Roth IRA Brokerage'),
    ).toEqual({
      withdrawalTaxRate: 0,
      taxableFraction: 0,
    });

    // HSA: 0% tax, 0% taxable
    expect(inferTaxSettingsForAccount('HealthEquity HSA')).toEqual({
      withdrawalTaxRate: 0,
      taxableFraction: 0,
    });

    // Traditional / 401(k): 15% tax, 100% taxable
    expect(
      inferTaxSettingsForAccount('GOOGLE LLC 401(K) SAVINGS PLAN'),
    ).toEqual({
      withdrawalTaxRate: 0.15,
      taxableFraction: 1.0,
    });
    expect(
      inferTaxSettingsForAccount('Gina Nicole Kofman - Rollover IRA'),
    ).toEqual({
      withdrawalTaxRate: 0.15,
      taxableFraction: 1.0,
    });
    expect(
      inferTaxSettingsForAccount('Ofek Gila - Traditional IRA Brokerage'),
    ).toEqual({
      withdrawalTaxRate: 0.15,
      taxableFraction: 1.0,
    });

    // Taxable brokerage: 10% effective tax, 50% taxable portion
    expect(inferTaxSettingsForAccount('Individual (Y7RT)')).toEqual({
      withdrawalTaxRate: 0.1,
      taxableFraction: 0.5,
    });
    expect(inferTaxSettingsForAccount('Schwab - Equity Awards')).toEqual({
      withdrawalTaxRate: 0.1,
      taxableFraction: 0.5,
    });
  });
});
