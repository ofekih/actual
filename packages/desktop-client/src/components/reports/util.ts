// @ts-strict-ignore
import type { Query } from '@actual-app/core/shared/query';
import type {
  AccountEntity,
  CategoryEntity,
  PayeeEntity,
  RuleConditionEntity,
} from '@actual-app/core/types/models';

import { aqlQuery } from '#queries/aqlQuery';

export function fromDateRepr(date: string): string {
  return date.slice(0, 7);
}

export async function runAll(
  queries: Query[],
  cb: (data) => void,
): Promise<void> {
  const data = await Promise.all(
    queries.map(q => {
      return aqlQuery(q).then(({ data }) => data);
    }),
  );
  cb(data);
}

export function indexCashFlow<
  T extends { date: string; isTransfer: boolean; amount: number },
>(data: T[]): Record<string, Record<'true' | 'false', number>> {
  const results: Record<string, Record<'true' | 'false', number>> = {};
  data.forEach(item => {
    const findExisting = results?.[item.date]?.[String(item.isTransfer)] ?? 0;
    const result = { [String(item.isTransfer)]: item.amount + findExisting };
    results[item.date] = { ...results[item.date], ...result };
  });
  return results;
}

/**
 * Checks if the given conditions have issues
 * (i.e. non-existing category/payee/account being used).
 */

export function calculateHasWarning(
  conditions: RuleConditionEntity[],
  {
    categories,
    accounts,
    payees,
  }: {
    categories: CategoryEntity[];
    accounts: AccountEntity[];
    payees: PayeeEntity[];
  },
) {
  const categoryIds = new Set(categories.map(({ id }) => id));
  const payeeIds = new Set(payees.map(({ id }) => id));
  const accountIds = new Set(accounts.map(({ id }) => id));

  if (!conditions) {
    return false;
  }

  for (const cond of conditions) {
    const { field, value, op } = cond;
    const isMultiCondition = Array.isArray(value);
    const isSupportedSingleCondition = ['is', 'isNot'].includes(op);

    // Regex and other more complicated operations are not supported
    if (!isSupportedSingleCondition && !isMultiCondition) {
      continue;
    }

    // Empty value.. we can skip
    if (!isMultiCondition && !value) {
      continue;
    }

    switch (field) {
      case 'account':
        if (isMultiCondition) {
          if (value.find(val => !accountIds.has(val))) {
            return true;
          }
          break;
        }

        if (!accountIds.has(value)) {
          return true;
        }
        break;
      case 'payee':
        if (isMultiCondition) {
          if (value.find(val => !payeeIds.has(val))) {
            return true;
          }
          break;
        }

        if (!payeeIds.has(value)) {
          return true;
        }
        break;
      case 'category':
        if (isMultiCondition) {
          if (value.find(val => !categoryIds.has(val))) {
            return true;
          }
          break;
        }

        if (!categoryIds.has(value)) {
          return true;
        }
        break;
      default:
        break;
    }
  }
  return false;
}

export const CSP_ACCOUNT_IDS = {
  savings: 'csp-savings',
  investments: 'csp-investments',
  assets: 'csp-assets',
  debt: 'csp-debt',
} as const;

export function getCspNetWorthData<T extends Record<string, unknown>>(
  graphData: {
    data: Array<T>;
    hasNegative: boolean;
    start: string;
    end: string;
  },
  accounts: AccountEntity[],
  accountTypes: Record<string, string>,
  t: (val: string) => string,
  liquidOnly?: boolean,
) {
  const mappedData = graphData.data.map(point => {
    let savings = 0;
    let investments = 0;
    let assets = 0;
    let debt = 0;

    accounts.forEach(acc => {
      const bal = Number(point[acc.id]) || 0;
      const type = accountTypes[acc.id];
      if (type === 'savings') savings += bal;
      else if (type === 'investments') investments += bal;
      else if (type === 'assets' || type === 'auto') assets += bal;
      else if (type === 'debt') debt += bal;
    });

    return {
      ...point,
      [CSP_ACCOUNT_IDS.savings]: savings,
      [CSP_ACCOUNT_IDS.investments]: investments,
      [CSP_ACCOUNT_IDS.assets]: assets,
      [CSP_ACCOUNT_IDS.debt]: debt,
    };
  });

  const cspAccounts = [
    { id: CSP_ACCOUNT_IDS.savings, name: t('Savings') },
    { id: CSP_ACCOUNT_IDS.investments, name: t('Investments') },
    { id: CSP_ACCOUNT_IDS.assets, name: t('Assets') },
    { id: CSP_ACCOUNT_IDS.debt, name: t('Debt') },
  ];

  const filteredAccounts = liquidOnly
    ? cspAccounts.filter(
        acc =>
          acc.id === CSP_ACCOUNT_IDS.savings || acc.id === CSP_ACCOUNT_IDS.debt,
      )
    : cspAccounts;

  let netWorth: number | undefined;
  let totalChange: number | undefined;
  if (mappedData.length > 0) {
    const firstPoint = mappedData[0];
    const lastPoint = mappedData[mappedData.length - 1];

    const getSum = (point: Record<string, unknown>) => {
      if (liquidOnly) {
        return (
          (Number(point[CSP_ACCOUNT_IDS.savings]) || 0) +
          (Number(point[CSP_ACCOUNT_IDS.debt]) || 0)
        );
      } else {
        return (
          (Number(point[CSP_ACCOUNT_IDS.savings]) || 0) +
          (Number(point[CSP_ACCOUNT_IDS.investments]) || 0) +
          (Number(point[CSP_ACCOUNT_IDS.assets]) || 0) +
          (Number(point[CSP_ACCOUNT_IDS.debt]) || 0)
        );
      }
    };

    netWorth = getSum(lastPoint);
    totalChange = getSum(lastPoint) - getSum(firstPoint);
  }

  return {
    graphData: {
      ...graphData,
      data: mappedData,
    },
    accounts: filteredAccounts,
    netWorth,
    totalChange,
  };
}
