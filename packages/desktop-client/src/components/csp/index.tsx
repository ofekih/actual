import React, {
  createContext,
  memo,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Trans } from 'react-i18next';

import { Block } from '@actual-app/components/block';
import { Button } from '@actual-app/components/button';
import {
  SvgArrowButtonDown1,
  SvgArrowButtonUp1,
} from '@actual-app/components/icons/v2';
import { Popover } from '@actual-app/components/popover';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import {
  amountToInteger,
  currencyToAmount,
  integerToCurrency,
} from '@actual-app/core/shared/util';
import type {
  AccountEntity,
  CategoryEntity,
  CategoryGroupEntity,
  CSPCategoryEntity,
} from '@actual-app/core/types/models';
import { css } from '@emotion/css';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  useDeleteCspCategoryGroupMutation,
  useDeleteCspCategoryMutation,
  useReorderCspCategoryMutation,
  useSaveCspCategoryGroupMutation,
  useSaveCspCategoryMutation,
} from '#budget';
import type {
  BudgetComponents,
  BudgetSummaryProps,
  CategoryGroupMonthProps,
  CategoryMonthProps,
} from '#components/budget';
import {
  CategoriesOverrideProvider,
  useCategoriesOverride,
} from '#components/budget/CategoriesOverrideContext';
import { ClickableCell } from '#components/budget/ClickableCell';
import { AutoSizingBudgetTable } from '#components/budget/DynamicBudgetTable';
import { EnvelopeBudgetProvider } from '#components/budget/envelope/EnvelopeBudgetContext';
import { TrackingBudgetProvider } from '#components/budget/tracking/TrackingBudgetContext';
import {
  makeAmountGrey,
  prewarmAllMonths,
  prewarmMonth,
} from '#components/budget/util';
import { Field, InputCell } from '#components/table';
import { useAccounts } from '#hooks/useAccounts';
import { useCspCategories } from '#hooks/useCspCategories';
import { useGlobalPref } from '#hooks/useGlobalPref';
import { useLocale } from '#hooks/useLocale';
import { useLocalPref } from '#hooks/useLocalPref';
import { useNavigate } from '#hooks/useNavigate';
import { SheetNameProvider } from '#hooks/useSheetName';
import { useSpreadsheet } from '#hooks/useSpreadsheet';
import { useSyncedPref } from '#hooks/useSyncedPref';

import { CspAuditsContext } from './CspAuditsContext';
import type { CspAudit } from './CspAuditsContext';
import { CspComponentsProvider } from './CspComponentsContext';

// ---------------------------------------------------------------------------
// CSP Actuals context – provides per-category spent amounts for a month
// ---------------------------------------------------------------------------

type CspActuals = Record<string, number>;

export const CspActualsContext = createContext<CspActuals>({});
export const CspTargetsContext = createContext<Record<string, number>>({});

export const isIncomeCategory = (
  cat: CategoryEntity,
  categoryGroups: CategoryGroupEntity[],
) => {
  const group = categoryGroups.find(g => g.id === cat.group);
  return group ? group.name.toLowerCase().includes('income') : false;
};

export const getCspTargetAmount = (
  cat: CategoryEntity,
  categoryGroups: CategoryGroupEntity[],
  targets: Record<string, number>,
) => {
  const plannedAmount = targets[cat.id];
  if (plannedAmount != null) {
    const isIncome = isIncomeCategory(cat, categoryGroups);
    return isIncome ? plannedAmount : -plannedAmount;
  }
  return 0;
};

export const getCspSpentAmount = (
  cat: CategoryEntity,
  actuals: Record<string, number>,
  audits: Record<string, CspAudit>,
  categoryGroups: CategoryGroupEntity[],
) => {
  const auditPeriod = (cat as CSPCategoryEntity).moving_average_months;
  if (auditPeriod != null && auditPeriod > 0) {
    const avg = audits[cat.id]?.average ?? 0;
    const isIncome = isIncomeCategory(cat, categoryGroups);
    return isIncome ? avg : -avg;
  }
  return actuals[cat.id] ?? 0;
};

export function useCspCategoryAudits(
  month: string,
  categories: CSPCategoryEntity[],
  budgetStartMonth: string,
) {
  const categoryHash = categories
    .map(c => `${c.id}:${c.moving_average_months}`)
    .join(',');

  return useQuery({
    queryKey: ['csp-category-audits', month, categoryHash, budgetStartMonth],
    queryFn: async () => {
      let maxWindow = 12;
      categories.forEach(c => {
        if (
          c.moving_average_months != null &&
          c.moving_average_months > maxWindow
        ) {
          maxWindow = c.moving_average_months;
        }
      });

      const diff = monthUtils.differenceInCalendarMonths(
        month,
        budgetStartMonth,
      );
      const availableMonths = Math.max(1, diff + 1);
      const globalDivisor = Math.min(maxWindow, availableMonths);
      const earliestStartMonth = monthUtils.subMonths(month, globalDivisor - 1);

      const { data } = await send(
        'query',
        q('transactions')
          .filter({
            tombstone: false,
            csp_category: { $ne: null },
            date: {
              $transform: '$month',
              $gte: earliestStartMonth,
              $lte: month,
            },
          })
          .select([
            'csp_category',
            { month: { $month: '$date' } },
            'amount',
            'transfer_id',
          ])
          .serialize(),
      );

      const sumsByCatAndMonth: Record<string, Record<string, number>> = {};
      for (const row of data) {
        const amount = row.amount;

        if (!sumsByCatAndMonth[row.csp_category]) {
          sumsByCatAndMonth[row.csp_category] = {};
        }
        sumsByCatAndMonth[row.csp_category][row.month] =
          (sumsByCatAndMonth[row.csp_category][row.month] || 0) + amount;
      }

      const sumsByCat: Record<string, { month: string; sum: number }[]> = {};
      for (const catId in sumsByCatAndMonth) {
        sumsByCat[catId] = Object.keys(sumsByCatAndMonth[catId]).map(m => ({
          month: m,
          sum: sumsByCatAndMonth[catId][m],
        }));
      }

      const audits: Record<string, CspAudit> = {};

      for (const cat of categories) {
        const N = cat.moving_average_months || 12;
        const catDivisor = Math.min(N, availableMonths);
        const catStartMonth = monthUtils.subMonths(month, catDivisor - 1);

        const catData = sumsByCat[cat.id] || [];
        let totalSum = 0;
        for (const row of catData) {
          if (row.month >= catStartMonth && row.month <= month) {
            totalSum += row.sum;
          }
        }

        const actualAverage = Math.round(Math.abs(totalSum) / catDivisor);

        audits[cat.id] = {
          average: actualAverage,
          deviation: 0,
          flag: null,
        };
      }

      return audits;
    },
    placeholderData: {},
    enabled: !!month && !!budgetStartMonth && categories.length > 0,
  });
}

export function useCspActualsForMonth(month: string) {
  return useQuery({
    queryKey: ['csp-actuals', month],
    queryFn: async () => {
      const { data } = await send(
        'query',
        q('transactions')
          .filter({
            date: { $transform: '$month', $eq: month },
            tombstone: false,
            csp_category: { $ne: null },
          })
          .select(['csp_category', 'amount', 'transfer_id'])
          .serialize(),
      );
      const res: CspActuals = {};

      for (const row of data) {
        const amount = row.amount;
        res[row.csp_category] = (res[row.csp_category] || 0) + amount;
      }

      return res;
    },
    placeholderData: {},
  });
}
export function useCspTargetsForMonth(month: string) {
  return useQuery({
    queryKey: ['csp-targets', month],
    queryFn: async () => {
      const targets = await send('csp/get-targets', { month });
      return targets as Record<string, number>;
    },
    placeholderData: {},
  });
}

// Re-export for convenience
export { useCspBudgetComponents } from './CspComponentsContext';

// ---------------------------------------------------------------------------
// CSP month-cell components (plugged in place of envelope/tracking ones)
// ---------------------------------------------------------------------------

function getDeviationStyles(
  targetAmount?: number,
  spentAmount?: number,
  isIncome?: boolean,
) {
  let devColor = theme.pageTextSubdued;
  let ArrowIcon = null;

  if (targetAmount != null && spentAmount != null && targetAmount !== 0) {
    const absSpent = Math.abs(spentAmount);
    const absTarget = Math.abs(targetAmount);
    const deviation = (absSpent - absTarget) / absTarget;

    if (deviation >= 0.1) {
      devColor = isIncome ? '#118c4f' : theme.errorText; // Green or Red
      ArrowIcon = SvgArrowButtonUp1;
    } else if (deviation >= 0.05) {
      devColor = isIncome ? '#22a06b' : theme.warningText; // Light Green or Orange
      ArrowIcon = SvgArrowButtonUp1;
    } else if (deviation <= -0.1) {
      devColor = isIncome ? theme.errorText : '#0055cc'; // Red or Blue
      ArrowIcon = SvgArrowButtonDown1;
    } else if (deviation <= -0.05) {
      devColor = isIncome ? theme.warningText : '#3399ff'; // Orange or Light Blue
      ArrowIcon = SvgArrowButtonDown1;
    }
  }

  return { devColor, ArrowIcon };
}

export function CspAmountCell({
  amount,
  percentage,
  dimIfZero,
  targetAmount,
  spentAmount,
  isIncome,
}: {
  amount: number;
  percentage?: number;
  dimIfZero?: boolean;
  targetAmount?: number;
  spentAmount?: number;
  isIncome?: boolean;
}) {
  const formatted = integerToCurrency(amount);

  const { devColor, ArrowIcon } = getDeviationStyles(
    targetAmount,
    spentAmount,
    isIncome,
  );

  const defaultColorStyle = makeAmountGrey(amount) ?? {
    color: amount < 0 ? theme.errorText : theme.tableText,
  };

  const colorStyle =
    dimIfZero && amount === 0
      ? { color: theme.pageTextSubdued }
      : defaultColorStyle;

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
      }}
    >
      {percentage !== undefined && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginRight: 8,
            color: devColor,
          }}
        >
          {ArrowIcon && (
            <ArrowIcon
              width={10}
              height={10}
              style={{ color: devColor, marginRight: 2 }}
            />
          )}
          <Text style={{ fontSize: 11, color: devColor }}>
            {percentage.toFixed(1)}%
          </Text>
        </View>
      )}
      <Text style={{ ...styles.tnum, textAlign: 'right', ...colorStyle }}>
        {formatted}
      </Text>
    </View>
  );
}

export type CspNetIncomeInfo = { target: number; spent: number };
export const CspNetIncomeContext = createContext<CspNetIncomeInfo>({
  target: 0,
  spent: 0,
});

export function useCspCategoryAmounts(category: CategoryEntity) {
  const actuals = useContext(CspActualsContext);
  const audits = useContext(CspAuditsContext);
  const netIncome = useContext(CspNetIncomeContext);
  const categoryGroups = useCategoriesOverride() || [];
  const targets = useContext(CspTargetsContext);

  const targetAmount = getCspTargetAmount(category, categoryGroups, targets);
  const spentAmount = getCspSpentAmount(
    category,
    actuals,
    audits,
    categoryGroups,
  );
  const isIncome = isIncomeCategory(category, categoryGroups);

  const targetPercentage =
    netIncome.target > 0
      ? (Math.abs(targetAmount) / netIncome.target) * 100
      : undefined;
  const spentPercentage =
    netIncome.spent > 0
      ? (Math.abs(spentAmount) / netIncome.spent) * 100
      : undefined;

  return {
    targetAmount,
    spentAmount,
    targetPercentage,
    spentPercentage,
    isIncome,
  };
}

export function useCspGroupAmounts(group: CategoryGroupEntity) {
  const actuals = useContext(CspActualsContext);
  const audits = useContext(CspAuditsContext);
  const netIncome = useContext(CspNetIncomeContext);
  const categoryGroups = useCategoriesOverride() || [];
  const targets = useContext(CspTargetsContext);

  const totalTarget = (group.categories ?? []).reduce(
    (sum, cat) => sum + getCspTargetAmount(cat, categoryGroups, targets),
    0,
  );
  const totalSpent = (group.categories ?? []).reduce(
    (sum, cat) => sum + getCspSpentAmount(cat, actuals, audits, categoryGroups),
    0,
  );

  const isIncome = group.name.toLowerCase().includes('income');

  const targetPercentage =
    netIncome.target > 0 && !isIncome
      ? (Math.abs(totalTarget) / netIncome.target) * 100
      : undefined;
  const spentPercentage =
    netIncome.spent > 0 && !isIncome
      ? (Math.abs(totalSpent) / netIncome.spent) * 100
      : undefined;

  return {
    totalTarget,
    totalSpent,
    targetPercentage,
    spentPercentage,
    isIncome,
  };
}

const CspExpenseCategoryMonth = memo(function CspExpenseCategoryMonth({
  category,
  month,
  editing,
  onEdit,
  onShowActivity,
}: CategoryMonthProps) {
  const queryClient = useQueryClient();
  const {
    targetAmount,
    spentAmount,
    targetPercentage,
    spentPercentage,
    isIncome,
  } = useCspCategoryAmounts(category);

  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        backgroundColor: theme.budgetCurrentMonth,
      }}
    >
      <InputCell
        name="target"
        width="flex"
        style={{ textAlign: 'right' }}
        exposed={editing}
        focused={editing}
        onExpose={() => onEdit(category.id, month)}
        onBlur={() => onEdit(null)}
        valueStyle={{
          cursor: 'default',
          margin: 1,
          padding: '0 4px',
          borderRadius: 4,
          ':hover': {
            boxShadow: 'inset 0 0 0 1px ' + theme.pageTextSubdued,
            backgroundColor: theme.budgetCurrentMonth,
          },
        }}
        value={targetAmount === null ? '' : integerToCurrency(targetAmount)}
        formatter={() => (
          <CspAmountCell
            amount={targetAmount}
            percentage={targetPercentage}
            dimIfZero
          />
        )}
        onUpdate={async value => {
          const newAmount = value
            ? amountToInteger(currencyToAmount(value) || 0)
            : null;
          if (newAmount !== targetAmount) {
            await send('csp/set-target', {
              month,
              category: category.id,
              amount: newAmount,
            });
            void queryClient.invalidateQueries({ queryKey: ['csp-targets'] });
          }
        }}
      />
      <Field name="spent" width="flex" style={{ textAlign: 'right' }}>
        <ClickableCell
          onClick={() => onShowActivity(category.id, month, 'csp_category')}
        >
          <CspAmountCell
            amount={spentAmount}
            percentage={spentPercentage}
            dimIfZero
            targetAmount={targetAmount}
            spentAmount={spentAmount}
            isIncome={isIncome}
          />
        </ClickableCell>
      </Field>
    </View>
  );
});

const CspExpenseGroupMonth = memo(function CspExpenseGroupMonth({
  group,
  month,
  onShowActivity,
}: CategoryGroupMonthProps) {
  const {
    totalTarget,
    totalSpent,
    targetPercentage,
    spentPercentage,
    isIncome,
  } = useCspGroupAmounts(group);

  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        backgroundColor: theme.budgetHeaderCurrentMonth,
      }}
    >
      <Field
        name="target"
        width="flex"
        style={{
          textAlign: 'right',
          fontWeight: 600,
        }}
      >
        <ClickableCell
          style={{ paddingRight: styles.monthRightPadding }}
          onClick={() => onShowActivity(group.id, month, 'csp_category_group')}
        >
          <CspAmountCell
            amount={totalTarget}
            percentage={targetPercentage}
            dimIfZero
            isIncome={isIncome}
          />
        </ClickableCell>
      </Field>
      <Field
        name="spent"
        width="flex"
        style={{
          textAlign: 'right',
          fontWeight: 600,
        }}
      >
        <ClickableCell
          style={{ paddingRight: styles.monthRightPadding }}
          onClick={() => onShowActivity(group.id, month, 'csp_category_group')}
        >
          <CspAmountCell
            amount={totalSpent}
            percentage={spentPercentage}
            dimIfZero
            targetAmount={totalTarget}
            spentAmount={totalSpent}
            isIncome={isIncome}
          />
        </ClickableCell>
      </Field>
    </View>
  );
});

const CspIncomeCategoryMonth = memo(function CspIncomeCategoryMonth({
  category,
  isLast,
  month,
  editing,
  onEdit,
  onShowActivity,
}: CategoryMonthProps) {
  const queryClient = useQueryClient();
  const { targetAmount, spentAmount, targetPercentage, spentPercentage } =
    useCspCategoryAmounts(category);

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <InputCell
        name="target"
        width="flex"
        style={{
          textAlign: 'right',
          ...(isLast && { borderBottomWidth: 0 }),
          backgroundColor: theme.budgetCurrentMonth,
        }}
        exposed={editing}
        focused={editing}
        onExpose={() => onEdit(category.id, month)}
        onBlur={() => onEdit(null)}
        valueStyle={{
          cursor: 'default',
          margin: 1,
          padding: '0 4px',
          borderRadius: 4,
          ':hover': {
            boxShadow: 'inset 0 0 0 1px ' + theme.pageTextSubdued,
            backgroundColor: theme.budgetCurrentMonth,
          },
        }}
        value={targetAmount === null ? '' : integerToCurrency(targetAmount)}
        formatter={() => (
          <CspAmountCell
            amount={targetAmount}
            percentage={targetPercentage}
            dimIfZero
          />
        )}
        onUpdate={async value => {
          const newAmount = value
            ? amountToInteger(currencyToAmount(value) || 0)
            : null;
          if (newAmount !== targetAmount) {
            await send('csp/set-target', {
              month,
              category: category.id,
              amount: newAmount,
            });
            void queryClient.invalidateQueries({ queryKey: ['csp-targets'] });
          }
        }}
      />
      <Field
        name="spent"
        width="flex"
        style={{
          textAlign: 'right',
          ...(isLast && { borderBottomWidth: 0 }),
          backgroundColor: theme.budgetCurrentMonth,
        }}
      >
        <ClickableCell
          onClick={() => onShowActivity(category.id, month, 'csp_category')}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 6,
            }}
          >
            <CspAmountCell
              amount={spentAmount}
              percentage={spentPercentage}
              dimIfZero
              isIncome
            />
          </View>
        </ClickableCell>
      </Field>
    </View>
  );
});

const CspIncomeGroupMonth = memo(function CspIncomeGroupMonth({
  group,
}: CategoryGroupMonthProps) {
  const { totalTarget, totalSpent } = useCspGroupAmounts(group);

  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        backgroundColor: theme.budgetHeaderCurrentMonth,
      }}
    >
      <Field
        name="target"
        width="flex"
        style={{
          textAlign: 'right',
          fontWeight: 600,
          paddingRight: styles.monthRightPadding,
        }}
      >
        <CspAmountCell amount={totalTarget} dimIfZero />
      </Field>
      <Field
        name="spent"
        width="flex"
        style={{
          textAlign: 'right',
          fontWeight: 600,
          paddingRight: styles.monthRightPadding,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 6,
          }}
        >
          <CspAmountCell amount={totalSpent} dimIfZero />
        </View>
      </Field>
    </View>
  );
});

function CspIncomeHeaderMonth() {
  return (
    <View
      style={{
        flexDirection: 'row',
        marginRight: styles.monthRightPadding,
        paddingBottom: 8,
      }}
    >
      <View style={{ flex: 1, padding: '0 5px', textAlign: 'right' }}>
        <Text style={{ color: theme.tableHeaderText }}>
          <Trans>Planned</Trans>
        </Text>
      </View>
      <View style={{ flex: 1, padding: '0 5px', textAlign: 'right' }}>
        <Text style={{ color: theme.tableHeaderText }}>
          <Trans>Actual</Trans>
        </Text>
      </View>
    </View>
  );
}

const CspBudgetTotalsMonth = memo(function CspBudgetTotalsMonth() {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        marginRight: styles.monthRightPadding,
        paddingTop: 10,
        paddingBottom: 10,
        backgroundColor: theme.budgetCurrentMonth,
      }}
    >
      <View style={{ flex: 1, padding: '0 5px', textAlign: 'right' }}>
        <Text style={{ color: theme.tableHeaderText }}>
          <Trans>Expected</Trans>
        </Text>
      </View>
      <View style={{ flex: 1, padding: '0 5px', textAlign: 'right' }}>
        <Text style={{ color: theme.tableHeaderText }}>
          <Trans>Received</Trans>
        </Text>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Net Worth Component
// ---------------------------------------------------------------------------

export type AccountGroupRowProps = {
  layout?: 'row-between' | 'row-center';
  label: ReactNode;
  amount: number;
  accounts: AccountEntity[];
  balances: Record<string, number>;
};

export function AccountGroupRow({
  layout = 'row-between',
  label,
  amount,
  accounts,
  balances,
}: AccountGroupRowProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View
      style={
        layout === 'row-between'
          ? {
              borderBottomWidth: 1,
              borderBottomStyle: 'solid',
              borderColor: theme.tableBorder,
            }
          : undefined
      }
    >
      <Button
        ref={triggerRef}
        variant="bare"
        onPress={() => setIsOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: layout === 'row-between' ? '10px 0' : '2px 8px',
          borderRadius: 4,
          width: '100%',
          justifyContent: layout === 'row-between' ? 'space-between' : 'center',
        }}
      >
        {layout === 'row-between' ? (
          <>
            <Text style={{ fontWeight: 500 }}>{label}</Text>
            <Text
              style={{
                ...styles.tnum,
                fontWeight: 500,
                color: amount < 0 ? theme.errorText : theme.tableText,
              }}
            >
              {integerToCurrency(amount)}
            </Text>
          </>
        ) : (
          <>
            <Text
              style={{
                textAlign: 'right',
                marginRight: 10,
                minWidth: 70,
                fontWeight: 600,
                ...styles.tnum,
                color: amount < 0 ? theme.errorText : theme.tableText,
              }}
            >
              {integerToCurrency(amount)}
            </Text>
            <Text style={{ minWidth: 80, textAlign: 'left' }}>{label}</Text>
          </>
        )}
      </Button>

      {isOpen && (
        <Popover
          triggerRef={triggerRef}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          placement="bottom start"
          style={{
            padding: 12,
            minWidth: 220,
            maxWidth: 320,
          }}
        >
          <View style={{ gap: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                borderBottom: `1px solid ${theme.tableBorder}`,
                paddingBottom: 6,
                gap: 10,
              }}
            >
              <Text style={{ fontWeight: 'bold' }}>{label}</Text>
              <Text
                style={{
                  fontWeight: 'bold',
                  ...styles.tnum,
                  color: amount < 0 ? theme.errorText : theme.tableText,
                }}
              >
                {integerToCurrency(amount)}
              </Text>
            </View>
            {accounts.length === 0 ? (
              <Text
                style={{
                  fontStyle: 'italic',
                  color: theme.pageTextSubdued,
                  fontSize: 12,
                  padding: '4px 0',
                }}
              >
                <Trans>No accounts</Trans>
              </Text>
            ) : (
              <View style={{ gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {accounts.map(acc => {
                  const bal = balances[acc.id] || 0;
                  return (
                    <View
                      key={acc.id}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 12,
                        gap: 15,
                      }}
                    >
                      <Text
                        style={{
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={acc.name}
                      >
                        {acc.name}
                      </Text>
                      <Text
                        style={{
                          ...styles.tnum,
                          color: bal < 0 ? theme.errorText : theme.tableText,
                        }}
                      >
                        {integerToCurrency(bal)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </Popover>
      )}
    </View>
  );
}

function CspBudgetSummary({ month }: BudgetSummaryProps) {
  const currentMonth = monthUtils.currentMonth();
  const [collapsed, setCollapsed] = useLocalPref('budget.summaryCollapsed');
  const locale = useLocale();

  const [accountTypesRaw] = useSyncedPref('csp-account-types');
  const accountTypes = accountTypesRaw ? JSON.parse(accountTypesRaw) : {};

  const { data: accounts = [] } = useAccounts();
  const { data: balances = {} } = useQuery({
    queryKey: ['csp-balances'],
    queryFn: async () => {
      const { data } = await send(
        'query',
        q('transactions')
          .filter({ tombstone: false })
          .groupBy('account')
          .select(['account', { sum: { $sum: '$amount' } }])
          .serialize(),
      );
      const res: Record<string, number> = {};
      data.forEach((row: { account: string; sum: number }) => {
        res[row.account] = row.sum;
      });
      return res;
    },
  });

  let savingsTotal = 0;
  let investmentsTotal = 0;
  let assetsTotal = 0;
  let debtTotal = 0;

  accounts
    .filter(a => !a.closed)
    .forEach(a => {
      const bal = balances[a.id] || 0;
      const type = accountTypes[a.id];

      if (type === 'savings') savingsTotal += bal;
      else if (type === 'investments') investmentsTotal += bal;
      else if (type === 'assets' || type === 'auto') assetsTotal += bal;
      else if (type === 'debt') debtTotal += bal;
    });

  const netWorth = savingsTotal + investmentsTotal + assetsTotal + debtTotal;

  const savingsAccounts = accounts.filter(
    a => !a.closed && accountTypes[a.id] === 'savings',
  );
  const investmentsAccounts = accounts.filter(
    a => !a.closed && accountTypes[a.id] === 'investments',
  );
  const assetsAccounts = accounts.filter(
    a =>
      !a.closed &&
      (accountTypes[a.id] === 'assets' || accountTypes[a.id] === 'auto'),
  );
  const debtAccounts = accounts.filter(
    a => !a.closed && accountTypes[a.id] === 'debt',
  );

  const ExpandOrCollapseIcon = collapsed
    ? SvgArrowButtonDown1
    : SvgArrowButtonUp1;

  function CspTotalNetWorth() {
    return (
      <View style={{ alignItems: 'center' }}>
        <Block>{netWorth < 0 ? 'NET DEBT:' : 'TOTAL NET WORTH:'}</Block>
        <View>
          <Block
            className={css([
              styles.veryLargeText,
              {
                fontWeight: 400,
                userSelect: 'none',
                color:
                  netWorth > 0
                    ? theme.toBudgetPositive
                    : netWorth < 0
                      ? theme.toBudgetNegative
                      : theme.toBudgetZero,
                marginBottom: -1,
              },
            ])}
          >
            {integerToCurrency(netWorth)}
          </Block>
        </View>
      </View>
    );
  }

  return (
    <View
      data-testid="csp-budget-summary"
      style={{
        backgroundColor:
          month === currentMonth
            ? theme.budgetCurrentMonth
            : theme.budgetOtherMonth,
        boxShadow: styles.cardShadow,
        borderRadius: 6,
        marginLeft: 0,
        marginRight: 0,
        marginTop: 5,
        flex: 1,
        cursor: 'default',
        marginBottom: 5,
        overflow: 'hidden',
        '& .hover-visible': {
          opacity: 0,
          transition: 'opacity .25s',
        },
        '&:hover .hover-visible': {
          opacity: 1,
        },
      }}
    >
      <View
        style={{
          padding: '0 13px',
          ...(collapsed ? { margin: '10px 0' } : { marginTop: 16 }),
        }}
      >
        <View style={{ position: 'absolute', left: 10, top: 0 }}>
          <Button
            variant="bare"
            className="hover-visible"
            onPress={() => setCollapsed(!collapsed)}
          >
            <ExpandOrCollapseIcon
              width={13}
              height={13}
              style={{ color: theme.pageTextLight, margin: 1 }}
            />
          </Button>
        </View>

        <div
          className={css([
            {
              textAlign: 'center',
              marginTop: 3,
              fontSize: 18,
              fontWeight: 500,
              textDecorationSkip: 'ink',
            },
            currentMonth === month && { fontWeight: 'bold' },
          ])}
        >
          {monthUtils.format(month, 'MMMM', locale)}
        </div>
      </View>

      {collapsed ? (
        <View
          style={{
            alignItems: 'center',
            padding: '10px 20px',
            justifyContent: 'space-between',
            backgroundColor: theme.budgetCurrentMonth,
            borderTop: '1px solid ' + theme.tableBorder,
          }}
        >
          <CspTotalNetWorth />
        </View>
      ) : (
        <>
          <View
            style={{
              flexDirection: 'column',
              lineHeight: 1.5,
              alignItems: 'center',
              ...styles.smallText,
              padding: '6px 0',
              marginTop: 17,
              backgroundColor: theme.budgetHeaderCurrentMonth,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: theme.tableBorder,
              gap: 2,
            }}
          >
            <AccountGroupRow
              layout="row-center"
              label={<Trans>Assets</Trans>}
              amount={assetsTotal}
              accounts={assetsAccounts}
              balances={balances}
            />
            <AccountGroupRow
              layout="row-center"
              label={<Trans>Investments</Trans>}
              amount={investmentsTotal}
              accounts={investmentsAccounts}
              balances={balances}
            />
            <AccountGroupRow
              layout="row-center"
              label={<Trans>Savings</Trans>}
              amount={savingsTotal}
              accounts={savingsAccounts}
              balances={balances}
            />
            <AccountGroupRow
              layout="row-center"
              label={<Trans>Debt</Trans>}
              amount={debtTotal}
              accounts={debtAccounts}
              balances={balances}
            />
          </View>
          <View style={{ margin: '23px 0' }}>
            <CspTotalNetWorth />
          </View>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Adapt CSP categories → CategoryGroupEntity[] for BudgetTable reuse
// ---------------------------------------------------------------------------

export function useCspCategoryGroups(): CategoryGroupEntity[] {
  const { data: categoriesData } = useCspCategories();
  const { grouped = [] } = categoriesData ?? {};

  return useMemo(() => {
    // Filter out N/A Ignored and empty groups
    const filteredGroups = grouped
      .map(g => ({
        ...g,
        categories: (g.categories ?? []).filter(
          c => !c.name.includes('N/A') && !c.name.includes('Ignored'),
        ),
      }))
      .filter(
        g =>
          !g.name.includes('N/A') &&
          !g.name.includes('Ignored') &&
          g.categories.length > 0,
      );

    const mapped = filteredGroups.map(
      (g): CategoryGroupEntity => ({
        id: g.id,
        name: g.name,
        sort_order: g.sort_order,
        tombstone: g.tombstone,
        is_income: false, // Map them all as expense groups so they render consecutively in their custom order
        hidden: false,
        categories: (g.categories ?? []).map(
          (c): CategoryEntity => ({
            id: c.id,
            name: c.name,
            group: c.group,
            sort_order: c.sort_order,
            tombstone: c.tombstone,
            is_income: false,
            hidden: false,
            planned_amount: c.planned_amount,
            moving_average_months: c.moving_average_months,
          }),
        ),
      }),
    );

    // Sort income group to the top
    mapped.sort((a, b) => {
      const isAIncome = a.name.toLowerCase().includes('income');
      const isBIncome = b.name.toLowerCase().includes('income');
      if (isAIncome && !isBIncome) return -1;
      if (!isAIncome && isBIncome) return 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

    return mapped;
  }, [grouped]);
}

// ---------------------------------------------------------------------------
// Csp page component – mirrors Budget page with CSP data
// ---------------------------------------------------------------------------

export function Csp() {
  const currentMonth = monthUtils.currentMonth();
  const spreadsheet = useSpreadsheet();
  const navigate = useNavigate();
  const [summaryCollapsed, setSummaryCollapsedPref] = useLocalPref(
    'budget.summaryCollapsed',
  );
  const [startMonthPref, setStartMonthPref] = useLocalPref('budget.startMonth');
  const startMonth = startMonthPref || currentMonth;
  const [bounds, setBounds] = useState({
    start: startMonth,
    end: startMonth,
  });
  const [budgetType = 'envelope'] = useSyncedPref('budgetType');
  const [maxMonthsPref] = useGlobalPref('maxMonths');
  const maxMonths = maxMonthsPref || 1;
  const [initialized, setInitialized] = useState(false);

  const categoryGroups = useCspCategoryGroups();

  // Fetch actuals for the current view month
  const { data: actuals = {} } = useCspActualsForMonth(startMonth);
  const { data: targets = {} } = useCspTargetsForMonth(startMonth);
  const { data: categoriesData } = useCspCategories();
  const { data: audits = {} } = useCspCategoryAudits(
    startMonth,
    categoriesData?.list ?? [],
    bounds.start,
  );

  const init = useEffectEvent(() => {
    async function run() {
      const { start, end } = await send('get-budget-bounds');
      setBounds({ start, end });

      await prewarmAllMonths(
        budgetType,
        spreadsheet,
        { start, end },
        startMonth,
      );

      setInitialized(true);
    }

    void run();
  });
  useEffect(() => init(), []);

  const loadBoundBudgets = useEffectEvent(() => {
    void send('get-budget-bounds').then(({ start, end }) => {
      if (bounds.start !== start || bounds.end !== end) {
        setBounds({ start, end });
      }
    });
  });
  useEffect(() => loadBoundBudgets(), []);

  const onMonthSelect = async (month: string, numDisplayed: number) => {
    setStartMonthPref(month);

    const warmingMonth = month;
    if (month < startMonth) {
      await prewarmMonth(
        budgetType,
        spreadsheet,
        monthUtils.subMonths(month, 1),
      );
    } else if (month > startMonth) {
      await prewarmMonth(
        budgetType,
        spreadsheet,
        monthUtils.addMonths(month, numDisplayed),
      );
    }

    if (warmingMonth === month) {
      setStartMonthPref(month);
    }
  };

  const onToggleCollapse = () => {
    setSummaryCollapsedPref(!summaryCollapsed);
  };

  const saveCategory = useSaveCspCategoryMutation();
  const deleteCategory = useDeleteCspCategoryMutation();
  const saveCategoryGroup = useSaveCspCategoryGroupMutation();
  const deleteCategoryGroup = useDeleteCspCategoryGroupMutation();
  const reorderCategory = useReorderCspCategoryMutation();

  // No-op handlers for budget-specific actions
  const noop = () => {
    /* no-op */
  };
  const noopBudgetAction = () => {
    /* no-op */
  };

  const onShowActivity = (
    categoryId: string,
    month?: string,
    field: 'csp_category' | 'csp_category_group' = 'csp_category',
  ) => {
    const filterConditions = [
      { field, op: 'is', value: categoryId, type: 'id' },
      ...(month
        ? [
            {
              field: 'date',
              op: 'is',
              value: month,
              options: { month: true },
              type: 'date',
            },
          ]
        : []),
    ];
    void navigate('/accounts', {
      state: {
        goBack: true,
        filterConditions,
        categoryId,
      },
    });
  };

  // CSP-specific budget components
  const cspComponents = useMemo<BudgetComponents>(
    () => ({
      SummaryComponent: CspBudgetSummary,
      ExpenseCategoryComponent: CspExpenseCategoryMonth,
      ExpenseGroupComponent: CspExpenseGroupMonth,
      IncomeCategoryComponent: CspIncomeCategoryMonth,
      IncomeGroupComponent: CspIncomeGroupMonth,
      BudgetTotalsComponent: CspBudgetTotalsMonth,
      IncomeHeaderComponent: CspIncomeHeaderMonth,
    }),
    [],
  );

  // Calculate Net Income dynamically for percentages
  const incomeGroup = categoryGroups.find(g =>
    g.name.toLowerCase().includes('income'),
  );

  const netIncomeTarget = incomeGroup
    ? (incomeGroup.categories ?? []).reduce(
        (sum, cat) => sum + getCspTargetAmount(cat, categoryGroups, targets),
        0,
      )
    : 0;
  const netIncomeSpent = incomeGroup
    ? (incomeGroup.categories ?? []).reduce(
        (sum, cat) =>
          sum + getCspSpentAmount(cat, actuals, audits, categoryGroups),
        0,
      )
    : 0;

  const netIncome: CspNetIncomeInfo = {
    target: netIncomeTarget,
    spent: netIncomeSpent,
  };

  if (!initialized || categoryGroups.length === 0) {
    return null;
  }

  const BudgetProvider =
    budgetType === 'tracking' ? TrackingBudgetProvider : EnvelopeBudgetProvider;

  return (
    <CspComponentsProvider value={cspComponents}>
      <CategoriesOverrideProvider value={categoryGroups}>
        <CspTargetsContext.Provider value={targets}>
          <CspActualsContext.Provider value={actuals}>
            <CspAuditsContext.Provider value={audits}>
              <CspNetIncomeContext.Provider value={netIncome}>
                <SheetNameProvider name={monthUtils.sheetForMonth(startMonth)}>
                  <View
                    style={{
                      ...styles.page,
                      paddingLeft: 8,
                      paddingRight: 8,
                      overflow: 'hidden',
                    }}
                  >
                    <BudgetProvider
                      summaryCollapsed={summaryCollapsed ?? false}
                      onBudgetAction={noopBudgetAction}
                      onToggleSummaryCollapse={onToggleCollapse}
                    >
                      <View style={{ flex: 1 }}>
                        <AutoSizingBudgetTable
                          type={budgetType}
                          prewarmStartMonth={startMonth}
                          startMonth={startMonth}
                          monthBounds={bounds}
                          maxMonths={maxMonths}
                          onMonthSelect={onMonthSelect}
                          onDeleteCategory={id => deleteCategory.mutate({ id })}
                          onDeleteGroup={id =>
                            deleteCategoryGroup.mutate({ id })
                          }
                          onSaveCategory={category =>
                            saveCategory.mutate({ category })
                          }
                          onSaveGroup={group =>
                            saveCategoryGroup.mutate({ group })
                          }
                          onBudgetAction={noopBudgetAction}
                          onShowActivity={onShowActivity}
                          onReorderCategory={reorderCategory.mutate}
                          onReorderGroup={noop}
                          onApplyBudgetTemplatesInGroup={noop}
                          onSortCategories={noop}
                        />
                      </View>
                    </BudgetProvider>
                  </View>
                </SheetNameProvider>
              </CspNetIncomeContext.Provider>
            </CspAuditsContext.Provider>
          </CspActualsContext.Provider>
        </CspTargetsContext.Provider>
      </CategoriesOverrideProvider>
    </CspComponentsProvider>
  );
}
