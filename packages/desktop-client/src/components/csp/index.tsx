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
import { integerToCurrency } from '@actual-app/core/shared/util';
import type {
  AccountEntity,
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';
import { css } from '@emotion/css';
import { useQuery } from '@tanstack/react-query';

import {
  useDeleteCspCategoryGroupMutation,
  useDeleteCspCategoryMutation,
  useSaveCspCategoryGroupMutation,
  useSaveCspCategoryMutation,
} from '#budget';
import type {
  BudgetComponents,
  BudgetSummaryProps,
  CategoryGroupMonthProps,
  CategoryMonthProps,
} from '#components/budget';
import { CategoriesOverrideProvider } from '#components/budget/CategoriesOverrideContext';
import { ClickableCell } from '#components/budget/ClickableCell';
import { AutoSizingBudgetTable } from '#components/budget/DynamicBudgetTable';
import { EnvelopeBudgetProvider } from '#components/budget/envelope/EnvelopeBudgetContext';
import { TrackingBudgetProvider } from '#components/budget/tracking/TrackingBudgetContext';
import {
  makeAmountGrey,
  prewarmAllMonths,
  prewarmMonth,
} from '#components/budget/util';
import { Field, Row } from '#components/table';
import { useAccounts } from '#hooks/useAccounts';
import { useCspCategories } from '#hooks/useCspCategories';
import { useGlobalPref } from '#hooks/useGlobalPref';
import { useLocale } from '#hooks/useLocale';
import { useLocalPref } from '#hooks/useLocalPref';
import { useNavigate } from '#hooks/useNavigate';
import { SheetNameProvider } from '#hooks/useSheetName';
import { useSpreadsheet } from '#hooks/useSpreadsheet';
import { useSyncedPref } from '#hooks/useSyncedPref';

import { CspComponentsProvider } from './CspComponentsContext';

// ---------------------------------------------------------------------------
// CSP Actuals context – provides per-category spent amounts for a month
// ---------------------------------------------------------------------------

type CspActuals = Record<string, number>;

export const CspActualsContext = createContext<CspActuals>({});

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
          .groupBy('csp_category')
          .select(['csp_category', { sum: { $sum: '$amount' } }])
          .serialize(),
      );
      const res: CspActuals = {};
      for (const row of data) {
        res[row.csp_category] = row.sum;
      }
      return res;
    },
    placeholderData: {},
  });
}

// Re-export for convenience
export { useCspBudgetComponents } from './CspComponentsContext';

// ---------------------------------------------------------------------------
// CSP month-cell components (plugged in place of envelope/tracking ones)
// ---------------------------------------------------------------------------

function CspAmountCell({
  amount,
  percentage,
}: {
  amount: number;
  percentage?: number;
}) {
  const formatted = integerToCurrency(amount);
  const colorStyle = makeAmountGrey(amount) ?? {
    color: amount < 0 ? theme.errorText : theme.tableText,
  };
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
      }}
    >
      {percentage !== undefined && (
        <Text
          style={{ fontSize: 11, color: theme.pageTextSubdued, marginRight: 8 }}
        >
          {percentage.toFixed(1)}%
        </Text>
      )}
      <Text style={{ ...styles.tnum, textAlign: 'right', ...colorStyle }}>
        {formatted}
      </Text>
    </View>
  );
}

export const CspNetIncomeContext = createContext<number>(0);

const CspExpenseCategoryMonth = memo(function CspExpenseCategoryMonth({
  category,
  month,
  onShowActivity,
}: CategoryMonthProps) {
  const actuals = useContext(CspActualsContext);
  const netIncome = useContext(CspNetIncomeContext);
  const amount = actuals[category.id] ?? 0;

  // Calculate percentage (expense amount / net income * 100). Expenses are usually negative.
  const percentage =
    netIncome > 0 && category.group !== 'income-group-id-placeholder'
      ? (Math.abs(amount) / netIncome) * 100
      : undefined;

  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        backgroundColor: theme.budgetCurrentMonth,
      }}
    >
      <Field name="spent" width="flex" style={{ textAlign: 'right' }}>
        <ClickableCell
          onClick={() => onShowActivity(category.id, month, 'csp_category')}
        >
          <CspAmountCell amount={amount} percentage={percentage} />
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
  const actuals = useContext(CspActualsContext);
  const netIncome = useContext(CspNetIncomeContext);
  const total = (group.categories ?? []).reduce(
    (sum, cat) => sum + (actuals[cat.id] ?? 0),
    0,
  );

  const isIncome = group.name.toLowerCase().includes('income');
  const percentage =
    netIncome > 0 && !isIncome
      ? (Math.abs(total) / netIncome) * 100
      : undefined;

  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        backgroundColor: theme.budgetHeaderCurrentMonth,
      }}
    >
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
          <CspAmountCell amount={total} percentage={percentage} />
        </ClickableCell>
      </Field>
    </View>
  );
});

const CspIncomeCategoryMonth = memo(function CspIncomeCategoryMonth({
  category,
  isLast,
  month,
  onShowActivity,
}: CategoryMonthProps) {
  const actuals = useContext(CspActualsContext);
  const amount = actuals[category.id] ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <Field
        name="received"
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
          <CspAmountCell amount={amount} />
        </ClickableCell>
      </Field>
    </View>
  );
});

function CspIncomeGroupMonth() {
  return (
    <View style={{ flex: 1 }}>
      <Row
        style={{
          color: theme.tableHeaderText,
          alignItems: 'center',
          paddingRight: 10,
          backgroundColor: theme.budgetCurrentMonth,
        }}
      >
        <View style={{ flex: 1, textAlign: 'right' }}>
          <Trans>Received</Trans>
        </View>
      </Row>
    </View>
  );
}

function CspIncomeHeaderMonth() {
  return (
    <Row
      style={{
        color: theme.tableHeaderText,
        alignItems: 'center',
        paddingRight: 10,
        backgroundColor: theme.budgetCurrentMonth,
      }}
    >
      <View style={{ flex: 1, textAlign: 'right' }}>
        <Trans>Received</Trans>
      </View>
    </Row>
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
          <Trans>Spent</Trans>
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
        is_income: false, // Map them all as expense groups so they render consecutively
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
  const netIncome = incomeGroup
    ? (incomeGroup.categories ?? []).reduce(
        (sum, cat) => sum + (actuals[cat.id] || 0),
        0,
      )
    : 0;

  if (!initialized || categoryGroups.length === 0) {
    return null;
  }

  const BudgetProvider =
    budgetType === 'tracking' ? TrackingBudgetProvider : EnvelopeBudgetProvider;

  return (
    <CspComponentsProvider value={cspComponents}>
      <CategoriesOverrideProvider value={categoryGroups}>
        <CspActualsContext.Provider value={actuals}>
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
                      onDeleteGroup={id => deleteCategoryGroup.mutate({ id })}
                      onSaveCategory={category =>
                        saveCategory.mutate({ category })
                      }
                      onSaveGroup={group => saveCategoryGroup.mutate({ group })}
                      onBudgetAction={noopBudgetAction}
                      onShowActivity={onShowActivity}
                      onReorderCategory={noop}
                      onReorderGroup={noop}
                      onApplyBudgetTemplatesInGroup={noop}
                      onSortCategories={noop}
                    />
                  </View>
                </BudgetProvider>
              </View>
            </SheetNameProvider>
          </CspNetIncomeContext.Provider>
        </CspActualsContext.Provider>
      </CategoriesOverrideProvider>
    </CspComponentsProvider>
  );
}
