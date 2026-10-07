import { useMemo } from 'react';

import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import { useQuery } from '@tanstack/react-query';

import { useCspTargetsForMonth } from '#components/csp/index';
import { useAccountBalances } from '#hooks/useAccountBalances';
import { useAccounts } from '#hooks/useAccounts';
import { useCspCategories } from '#hooks/useCspCategories';
import { useSyncedPref } from '#hooks/useSyncedPref';

import type {
  CspInvestmentAccount,
  CspInvestmentCategory,
  CspLivingExpenses,
  InvestmentHistoryPoint,
} from './types';

export function useCspInvestmentData() {
  const [accountTypesRaw] = useSyncedPref('csp-account-types');
  const [userBirthDateRaw] = useSyncedPref('csp-user-birth-date');
  const [spouseBirthDateRaw] = useSyncedPref('csp-spouse-birth-date');
  const [spouseNameRaw] = useSyncedPref('csp-spouse-name');
  const [userBirthYearRaw] = useSyncedPref('csp-user-birth-year');
  const [spouseBirthYearRaw] = useSyncedPref('csp-spouse-birth-year');

  const userBirthDate = userBirthDateRaw || '1999-07-10';
  const spouseBirthDate = spouseBirthDateRaw || '2001-10-12';
  const spouseName = spouseNameRaw || 'Nicole';

  const userBirthYear = useMemo(() => {
    if (userBirthDate) {
      const parsedYear = parseInt(userBirthDate.slice(0, 4), 10);
      if (!isNaN(parsedYear) && parsedYear > 1900) return parsedYear;
    }
    const parsed = Number(userBirthYearRaw);
    return !isNaN(parsed) && parsed > 1900 ? parsed : 1999;
  }, [userBirthDate, userBirthYearRaw]);

  const spouseBirthYear = useMemo(() => {
    if (spouseBirthDate) {
      const parsedYear = parseInt(spouseBirthDate.slice(0, 4), 10);
      if (!isNaN(parsedYear) && parsedYear > 1900) return parsedYear;
    }
    const parsed = Number(spouseBirthYearRaw);
    return !isNaN(parsed) && parsed > 1900 ? parsed : 2001;
  }, [spouseBirthDate, spouseBirthYearRaw]);

  const accountTypes: Record<string, string> = useMemo(() => {
    if (!accountTypesRaw) return {};
    try {
      return JSON.parse(accountTypesRaw);
    } catch {
      return {};
    }
  }, [accountTypesRaw]);

  const { data: allAccounts = [] } = useAccounts();

  const rawInvestmentAccounts = useMemo(() => {
    return allAccounts.filter(
      acc => !acc.closed && accountTypes[acc.id] === 'investments',
    );
  }, [allAccounts, accountTypes]);

  const investmentAccountIds = useMemo(() => {
    return rawInvestmentAccounts.map(acc => acc.id);
  }, [rawInvestmentAccounts]);

  const liveBalances = useAccountBalances(investmentAccountIds);

  const investmentAccounts: CspInvestmentAccount[] = useMemo(() => {
    return rawInvestmentAccounts.map(acc => ({
      id: acc.id,
      name: acc.name,
      balance: liveBalances[acc.id] ?? 0,
      type: 'investments',
    }));
  }, [rawInvestmentAccounts, liveBalances]);

  const currentMonth = monthUtils.currentMonth();
  const { data: targets = {} } = useCspTargetsForMonth(currentMonth);
  const { data: categoriesData } = useCspCategories();

  const { investmentGroup, fixedCostsGroup, guiltFreeGroup } = useMemo(() => {
    if (!categoriesData?.grouped) {
      return {
        investmentGroup: null,
        fixedCostsGroup: null,
        guiltFreeGroup: null,
      };
    }
    const grouped = categoriesData.grouped;
    const inv = grouped.find(g => g.name.toLowerCase().includes('invest'));
    const fixed = grouped.find(g => g.name.toLowerCase().includes('fixed'));
    const guilt = grouped.find(
      g =>
        g.name.toLowerCase().includes('guilt') ||
        g.name.toLowerCase().includes('fun'),
    );
    return {
      investmentGroup: inv || null,
      fixedCostsGroup: fixed || null,
      guiltFreeGroup: guilt || null,
    };
  }, [categoriesData]);

  // Query trailing 12-month actual contributions for investment categories
  const investmentCategoryIds = useMemo(() => {
    return investmentGroup?.categories.map(c => c.id) || [];
  }, [investmentGroup]);

  const { data: actualsByCategory = {} } = useQuery({
    queryKey: ['csp-investment-actuals', investmentCategoryIds],
    queryFn: async () => {
      if (investmentCategoryIds.length === 0) return {};
      const twelveMonthsAgo = monthUtils.subMonths(currentMonth, 12) + '-01';
      const today = monthUtils.currentDay();

      const { data } = await send(
        'query',
        q('transactions')
          .filter({
            tombstone: false,
            csp_category: { $oneof: investmentCategoryIds },
            date: { $gte: twelveMonthsAgo, $lte: today },
          })
          .groupBy('csp_category')
          .select(['csp_category', { sum: { $sum: '$amount' } }])
          .serialize(),
      );

      const res: Record<string, number> = {};
      (data || []).forEach((row: { csp_category: string; sum: number }) => {
        // Amounts in transactions are negative for expenses/investments
        res[row.csp_category] = Math.abs(row.sum || 0);
      });
      return res;
    },
    enabled: investmentCategoryIds.length > 0,
    placeholderData: {},
  });

  const investmentCategories: CspInvestmentCategory[] = useMemo(() => {
    if (!investmentGroup) return [];
    return investmentGroup.categories.map(c => {
      const monthlyTarget = targets[c.id] || 0;
      const annualPlanned = monthlyTarget * 12;
      const trailing12MonthActual = actualsByCategory[c.id] || 0;
      return {
        id: c.id,
        name: c.name,
        groupId: investmentGroup.id,
        groupName: investmentGroup.name,
        monthlyTarget,
        annualPlanned,
        trailing12MonthActual,
      };
    });
  }, [investmentGroup, targets, actualsByCategory]);

  const livingExpenses: CspLivingExpenses = useMemo(() => {
    let fixedCostsMonthly = 0;
    let guiltFreeMonthly = 0;

    if (fixedCostsGroup) {
      fixedCostsGroup.categories.forEach(c => {
        fixedCostsMonthly += targets[c.id] || 0;
      });
    }

    if (guiltFreeGroup) {
      guiltFreeGroup.categories.forEach(c => {
        guiltFreeMonthly += targets[c.id] || 0;
      });
    }

    const totalMonthly = fixedCostsMonthly + guiltFreeMonthly;
    return {
      fixedCostsMonthly,
      guiltFreeMonthly,
      totalMonthly,
      totalAnnual: totalMonthly * 12,
    };
  }, [fixedCostsGroup, guiltFreeGroup, targets]);

  // Query historical year-end balances of investment accounts

  const { data: historicalBalances = [] } = useQuery({
    queryKey: ['csp-investment-history', investmentAccountIds],
    queryFn: async () => {
      if (investmentAccountIds.length === 0) return [];

      const { data } = await send(
        'query',
        q('transactions')
          .filter({
            tombstone: false,
            account: { $oneof: investmentAccountIds },
          })
          .groupBy({ $month: '$date' })
          .select([
            { month: { $month: '$date' } },
            { sum: { $sum: '$amount' } },
          ])
          .serialize(),
      );

      if (!data || data.length === 0) return [];

      const sortedData = [...data].sort((a, b) =>
        a.month.localeCompare(b.month),
      );

      // Compute cumulative running balance per month
      let runningBalance = 0;
      const balanceByMonth: Record<string, number> = {};
      sortedData.forEach((row: { month: string; sum: number }) => {
        runningBalance += row.sum || 0;
        balanceByMonth[row.month] = runningBalance;
      });

      // Sample year-end balances (December of each year) plus current balance
      const currentYear = new Date().getFullYear();
      const points: InvestmentHistoryPoint[] = [];

      const years = Array.from(
        new Set(
          sortedData.map((row: { month: string }) =>
            parseInt(row.month.slice(0, 4), 10),
          ),
        ),
      ).sort((a, b) => a - b);

      years.forEach(year => {
        if (year < currentYear) {
          // Look for December of that year, or the last available month of that year
          const decMonth = `${year}-12`;
          let balance = balanceByMonth[decMonth];
          if (balance === undefined) {
            const monthsInYear = Object.keys(balanceByMonth)
              .filter(m => m.startsWith(`${year}-`))
              .sort();
            const lastMonth = monthsInYear[monthsInYear.length - 1];
            balance = lastMonth ? balanceByMonth[lastMonth] : 0;
          }
          points.push({
            date: `${year}-12-31`,
            year,
            balance: Math.max(0, balance),
          });
        }
      });

      // For current year: use total current balance of the accounts
      const currentTotal = investmentAccounts.reduce(
        (sum, acc) => sum + (acc.balance ?? 0),
        0,
      );
      points.push({
        date: monthUtils.currentDay(),
        year: currentYear,
        balance: Math.max(0, currentTotal),
      });

      return points;
    },
    enabled: investmentAccountIds.length > 0,
    placeholderData: [],
  });

  return {
    investmentAccounts,
    investmentCategories,
    livingExpenses,
    historicalBalances,
    userBirthYear,
    spouseBirthYear,
    userBirthDate,
    spouseBirthDate,
    spouseName,
  };
}
