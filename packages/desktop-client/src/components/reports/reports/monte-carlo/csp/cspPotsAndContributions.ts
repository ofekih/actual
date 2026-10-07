import { v4 as uuidv4 } from 'uuid';

import {
  ALLOCATION_PRESETS,
  createMonteCarloPot,
  createMonteCarloSpendingPhase,
  createMonteCarloSurplusPot,
  PRESET_ASSET_WEIGHTS,
} from '#components/reports/reports/monte-carlo/monteCarloSimulation';
import type {
  MonteCarloContribution,
  MonteCarloPot,
  MonteCarloSpendingPhase,
} from '#components/reports/reports/monte-carlo/monteCarloSimulation';

import type {
  CspInvestmentAccount,
  CspInvestmentCategory,
  CspLivingExpenses,
} from './types';

/**
 * Infers appropriate tax settings (withdrawal tax rate and taxable fraction)
 * based on the account name and typical tax classification:
 * - Roth accounts: 0% tax, 0% taxable income (tax-free in retirement)
 * - HSA accounts: 0% tax, 0% taxable income (tax-free for healthcare)
 * - Traditional IRA / 401(k) / Pre-tax: 15% effective tax rate, 100% taxable income
 * - Taxable Brokerage: 10% effective capital gains tax, 50% taxable gains portion
 */
export function inferTaxSettingsForAccount(accountName: string): {
  withdrawalTaxRate: number;
  taxableFraction: number;
} {
  const nameLower = accountName.toLowerCase();

  // 1. Roth accounts: 100% tax-free in retirement
  if (nameLower.includes('roth')) {
    return {
      withdrawalTaxRate: 0,
      taxableFraction: 0,
    };
  }

  // 2. Health Savings Accounts (HSA): 100% tax-free for healthcare
  if (nameLower.includes('hsa') || nameLower.includes('health')) {
    return {
      withdrawalTaxRate: 0,
      taxableFraction: 0,
    };
  }

  // 3. Traditional Pre-Tax accounts: 401(k), Traditional IRA, Rollover IRA
  // Withdrawals are taxed as ordinary income. 15% is a standard effective federal + state estimate.
  if (
    nameLower.includes('traditional') ||
    nameLower.includes('rollover') ||
    nameLower.includes('401k') ||
    nameLower.includes('401(k)') ||
    nameLower.includes('pre-tax') ||
    nameLower.includes('sep') ||
    nameLower.includes('simple')
  ) {
    return {
      withdrawalTaxRate: 0.15,
      taxableFraction: 1.0,
    };
  }

  // 4. Taxable Brokerage accounts:
  // Withdrawals return cost basis (tax-free) + capital gains (taxed at 15% cap gains).
  // Effective withdrawal tax rate is ~10%.
  return {
    withdrawalTaxRate: 0.1,
    taxableFraction: 0.5,
  };
}

/**
 * Creates or updates pots corresponding to the user's CSP investment accounts.
 * Existing pots linked to the same account are preserved.
 */
export function createPotsFromCspAccounts(
  investmentAccounts: CspInvestmentAccount[],
  existingPots: MonteCarloPot[] = [],
): MonteCarloPot[] {
  // Preserve or create surplus pot
  const existingSurplus = existingPots.find(p => p.isSurplus);
  const surplusPot = existingSurplus ?? createMonteCarloSurplusPot(uuidv4());

  const resultPots: MonteCarloPot[] = [surplusPot];

  // Map each investment account to a pot
  investmentAccounts.forEach(acc => {
    const existing = existingPots.find(p => p.accountId === acc.id);
    const taxSettings = inferTaxSettingsForAccount(acc.name);

    if (existing) {
      resultPots.push({
        ...existing,
        startingBalance: acc.balance,
        withdrawalTaxRate:
          existing.withdrawalTaxRate === 0 && taxSettings.withdrawalTaxRate > 0
            ? taxSettings.withdrawalTaxRate
            : existing.withdrawalTaxRate,
        taxableFraction:
          existing.taxableFraction === 1 && taxSettings.taxableFraction < 1
            ? taxSettings.taxableFraction
            : existing.taxableFraction,
      });
    } else {
      const newPot = createMonteCarloPot(uuidv4());
      resultPots.push({
        ...newPot,
        name: acc.name,
        startingBalance: acc.balance,
        accountId: acc.id,
        allocationPreset: 'equity-80',
        allocationStocks: PRESET_ASSET_WEIGHTS['equity-80'].stocks,
        allocationBonds: PRESET_ASSET_WEIGHTS['equity-80'].bonds,
        allocationCash: PRESET_ASSET_WEIGHTS['equity-80'].cash,
        expectedReturnMean: ALLOCATION_PRESETS['equity-80'].mean,
        returnStdDev: ALLOCATION_PRESETS['equity-80'].stdDev,
        withdrawalTaxRate: taxSettings.withdrawalTaxRate,
        taxableFraction: taxSettings.taxableFraction,
      });
    }
  });

  // If there are no investment accounts, ensure at least one ordinary pot exists
  if (resultPots.length === 1) {
    const nonSurplus = existingPots.filter(p => !p.isSurplus);
    if (nonSurplus.length > 0) {
      resultPots.push(...nonSurplus);
    } else {
      resultPots.push(createMonteCarloPot(uuidv4()));
    }
  }

  return resultPots;
}

/**
 * Creates contributions corresponding to categories in the CSP Investments group.
 * Matches category names to pot names where possible, defaulting to the first ordinary pot.
 */
export function createContributionsFromCsp(
  categories: CspInvestmentCategory[],
  pots: MonteCarloPot[],
  retirementYearOrAge: number | null = null,
  useActuals = false,
): MonteCarloContribution[] {
  const ordinaryPots = pots.filter(p => !p.isSurplus);
  const defaultPotId = ordinaryPots[0]?.id || '';

  return categories.map((cat, idx) => {
    // Try to find a matching pot by name
    const catNameLower = cat.name.toLowerCase();
    const matchedPot = ordinaryPots.find(pot => {
      const potNameLower = pot.name.toLowerCase();
      return (
        potNameLower.includes(catNameLower) ||
        catNameLower.includes(potNameLower)
      );
    });

    const potId = matchedPot ? matchedPot.id : defaultPotId;
    const amount =
      useActuals && cat.trailing12MonthActual > 0
        ? cat.trailing12MonthActual
        : cat.annualPlanned;

    return {
      id: `csp-contrib-${idx + 1}-${uuidv4().slice(0, 8)}`,
      name: cat.name,
      potId,
      fromAge: null,
      toAge: retirementYearOrAge,
      annualAmount: Math.max(0, amount),
      adjustsWithInflation: true,
      sourceIncomeStreamId: null,
      beforeTax: false,
      cspCategoryId: cat.id,
    };
  });
}

/**
 * Creates retirement spending phases based on CSP Fixed Costs + Guilt-Free living expenses.
 */
export function createRetirementSpendingFromCsp(
  livingExpenses: CspLivingExpenses,
  retirementYearOrAge: number | null,
  multiplier = 1.0,
): MonteCarloSpendingPhase[] {
  const annualAmount = Math.round(livingExpenses.totalAnnual * multiplier);
  const retirementPhase: MonteCarloSpendingPhase = {
    ...createMonteCarloSpendingPhase('csp-retirement-spending'),
    name: 'Retirement living expenses',
    fromAge: retirementYearOrAge,
    annualWithdrawal: Math.max(0, annualAmount),
  };

  if (retirementYearOrAge != null) {
    const accumulationPhase: MonteCarloSpendingPhase = {
      ...createMonteCarloSpendingPhase('csp-accumulation-phase'),
      name: 'Accumulation (pre-retirement)',
      fromAge: null,
      annualWithdrawal: 0,
    };
    return [accumulationPhase, retirementPhase];
  }

  return [retirementPhase];
}
