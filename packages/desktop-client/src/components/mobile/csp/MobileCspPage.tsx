import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from 'react';
import { GridListItem } from 'react-aria-components';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Card } from '@actual-app/components/card';
import { SvgCheveronRight } from '@actual-app/components/icons/v1';
import { Label } from '@actual-app/components/label';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import { integerToCurrency } from '@actual-app/core/shared/util';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import { CategoriesOverrideProvider } from '#components/budget/CategoriesOverrideContext';
import { EnvelopeBudgetProvider } from '#components/budget/envelope/EnvelopeBudgetContext';
import { TrackingBudgetProvider } from '#components/budget/tracking/TrackingBudgetContext';
import { prewarmAllMonths, prewarmMonth } from '#components/budget/util';
import { useCspAudits } from '#components/csp/CspAuditsContext';
import {
  CspActualsContext,
  CspAmountCell,
  CspNetIncomeContext,
  CspTargetsContext,
  getCspSpentAmount,
  getCspTargetAmount,
  useCspActualsForMonth,
  useCspCategoryAmounts,
  useCspCategoryGroups,
  useCspGroupAmounts,
  useCspTargetsForMonth,
} from '#components/csp/index';
import type { CspNetIncomeInfo } from '#components/csp/index';
import { MonthSelector } from '#components/mobile/budget/BudgetPage';
import {
  BudgetTable,
  getColumnWidth,
  ROW_HEIGHT,
} from '#components/mobile/budget/BudgetTable';
import { ExpenseCategoryList } from '#components/mobile/budget/ExpenseCategoryList';
import { ExpenseCategoryName } from '#components/mobile/budget/ExpenseCategoryListItem';
import { ExpenseGroupName } from '#components/mobile/budget/ExpenseGroupListItem';
import { IncomeCategoryList } from '#components/mobile/budget/IncomeCategoryList';
import { IncomeCategoryName } from '#components/mobile/budget/IncomeCategoryListItem';
import { IncomeGroupName } from '#components/mobile/budget/IncomeGroup';
import { MobileBudgetComponentsProvider } from '#components/mobile/budget/MobileBudgetComponentsContext';
import { MobilePageHeader, Page } from '#components/Page';
import { SyncRefresh } from '#components/SyncRefresh';
import { useAccounts } from '#hooks/useAccounts';
import { useLocalPref } from '#hooks/useLocalPref';
import { SheetNameProvider } from '#hooks/useSheetName';
import { useSpreadsheet } from '#hooks/useSpreadsheet';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

const CspNetWorthContext = createContext<number>(0);

type CspMobileCategoryListItemProps = {
  value: CategoryEntity;
  month: string;
  isHidden?: boolean;
  show3Columns?: boolean;
  onEditCategory: (id: string) => void;
};

function CspMobileCategoryListItem({
  value: category,
  month,
  isHidden,
  show3Columns = false,
  onEditCategory,
  ...props
}: CspMobileCategoryListItemProps) {
  const audits = useCspAudits();
  const {
    targetAmount,
    spentAmount,
    targetPercentage,
    spentPercentage,
    isIncome,
  } = useCspCategoryAmounts(category);

  const columnWidth = getColumnWidth({ show3Columns });

  return (
    <GridListItem textValue={category.name} {...props}>
      <View
        style={{
          height: ROW_HEIGHT,
          borderColor: theme.tableBorder,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 5,
          paddingRight: 5,
          borderBottomWidth: 1,
          opacity: isHidden ? 0.5 : undefined,
          backgroundColor: monthUtils.isCurrentMonth(month)
            ? theme.budgetCurrentMonth
            : theme.budgetOtherMonth,
        }}
      >
        {isIncome ? (
          <IncomeCategoryName
            category={category}
            onEdit={onEditCategory}
            isMovingAverage={audits?.[category.id] != null}
          />
        ) : (
          <ExpenseCategoryName
            category={category}
            onEditCategory={onEditCategory}
            show3Columns={show3Columns}
            isMovingAverage={audits?.[category.id] != null}
          />
        )}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: columnWidth,
              justifyContent: 'center',
              alignItems: 'flex-end',
              paddingRight: 5,
            }}
          >
            <CspAmountCell
              amount={targetAmount}
              percentage={targetPercentage}
              dimIfZero={targetAmount === 0}
              isIncome={isIncome}
            />
          </View>
          <View
            style={{
              width: columnWidth,
              justifyContent: 'center',
              alignItems: 'flex-end',
              paddingRight: 5,
            }}
          >
            <CspAmountCell
              amount={spentAmount}
              percentage={spentPercentage}
              targetAmount={targetAmount}
              spentAmount={spentAmount}
              dimIfZero={spentAmount === 0}
              isIncome={isIncome}
            />
          </View>
        </View>
      </View>
    </GridListItem>
  );
}

type CspExpenseGroupListItemProps = {
  value: CategoryGroupEntity;
  month: string;
  showHiddenCategories: boolean;
  onEditCategoryGroup: (id: string) => void;
  onEditCategory: (id: string) => void;
  onBudgetAction: (action: string, arg?: unknown) => void;
  isCollapsed: (id: string) => boolean;
  onToggleCollapse: (id: string) => void;
  showBudgetedColumn: boolean;
  show3Columns: boolean;
  isHidden?: boolean;
};

function CspExpenseGroupListItem({
  value: categoryGroup,
  month,
  showHiddenCategories,
  onEditCategoryGroup,
  onEditCategory,
  onBudgetAction,
  isCollapsed,
  onToggleCollapse,
  showBudgetedColumn,
  show3Columns,
  isHidden,
  ...props
}: CspExpenseGroupListItemProps) {
  const { totalTarget, totalSpent, targetPercentage, spentPercentage } =
    useCspGroupAmounts(categoryGroup);

  const categories = useMemo(
    () =>
      !categoryGroup || isCollapsed(categoryGroup.id)
        ? []
        : (categoryGroup.categories?.filter(
            category => !category.hidden || showHiddenCategories,
          ) ?? []),
    [categoryGroup, isCollapsed, showHiddenCategories],
  );

  const columnWidth = getColumnWidth({ show3Columns });

  const shouldHideCategory = useCallback(
    (category: CategoryEntity) => {
      return !!(category.hidden || categoryGroup?.hidden);
    },
    [categoryGroup?.hidden],
  );

  return (
    <GridListItem textValue={categoryGroup.name} {...props}>
      <Card style={{ marginTop: 4, marginBottom: 4 }}>
        <View
          onClick={() => onToggleCollapse(categoryGroup.id)}
          style={{
            cursor: 'pointer',
            height: ROW_HEIGHT,
            borderBottomWidth: 1,
            borderColor: theme.tableBorder,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 5,
            paddingRight: 5,
            opacity: isHidden ? 0.5 : undefined,
            backgroundColor: monthUtils.isCurrentMonth(month)
              ? theme.budgetHeaderCurrentMonth
              : theme.budgetHeaderOtherMonth,
          }}
        >
          <ExpenseGroupName
            group={categoryGroup}
            onEditCategoryGroup={onEditCategoryGroup}
            isCollapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
            show3Columns={show3Columns}
          />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              alignItems: 'center',
              paddingRight: 5,
            }}
          >
            <View style={{ width: columnWidth, alignItems: 'flex-end' }}>
              <CspAmountCell
                amount={totalTarget}
                percentage={targetPercentage}
                dimIfZero={totalTarget === 0}
              />
            </View>
            <View style={{ width: columnWidth, alignItems: 'flex-end' }}>
              <CspAmountCell
                amount={totalSpent}
                percentage={spentPercentage}
                targetAmount={totalTarget}
                spentAmount={totalSpent}
                dimIfZero={totalSpent === 0}
              />
            </View>
          </View>
        </View>

        <ExpenseCategoryList
          categoryGroup={categoryGroup}
          categories={categories}
          month={month}
          onEditCategory={onEditCategory}
          onBudgetAction={onBudgetAction}
          shouldHideCategory={shouldHideCategory}
          show3Columns={show3Columns}
          showBudgetedColumn={showBudgetedColumn}
        />
      </Card>
    </GridListItem>
  );
}

type CspIncomeGroupProps = {
  categoryGroup: CategoryGroupEntity;
  month: string;
  showHiddenCategories: boolean;
  onEditCategoryGroup: (id: string) => void;
  onEditCategory: (id: string) => void;
  onBudgetAction: (action: string, arg?: unknown) => void;
  isCollapsed: (id: string) => boolean;
  onToggleCollapse: (id: string) => void;
};

function CspIncomeGroup({
  categoryGroup,
  month,
  showHiddenCategories,
  onEditCategoryGroup,
  onEditCategory,
  onBudgetAction,
  isCollapsed,
  onToggleCollapse,
}: CspIncomeGroupProps) {
  const { t } = useTranslation();
  const columnWidth = getColumnWidth();
  const { totalTarget, totalSpent, targetPercentage, spentPercentage } =
    useCspGroupAmounts(categoryGroup);

  const categories = useMemo(
    () =>
      isCollapsed(categoryGroup.id)
        ? []
        : (categoryGroup.categories?.filter(
            category => !category.hidden || showHiddenCategories,
          ) ?? []),
    [
      categoryGroup.categories,
      categoryGroup.id,
      isCollapsed,
      showHiddenCategories,
    ],
  );

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          marginTop: 50,
          marginBottom: 5,
          marginRight: 15,
        }}
      >
        <Label title={t('Expected')} style={{ width: columnWidth }} />
        <Label title={t('Received')} style={{ width: columnWidth }} />
      </View>

      <Card style={{ marginTop: 0 }}>
        <View
          onClick={() => onToggleCollapse(categoryGroup.id)}
          style={{
            cursor: 'pointer',
            height: ROW_HEIGHT,
            borderBottomWidth: 1,
            borderColor: theme.tableBorder,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 5,
            paddingRight: 5,
            opacity: categoryGroup.hidden ? 0.5 : undefined,
            backgroundColor: monthUtils.isCurrentMonth(month)
              ? theme.budgetHeaderCurrentMonth
              : theme.budgetHeaderOtherMonth,
          }}
        >
          <IncomeGroupName
            group={categoryGroup}
            onEdit={onEditCategoryGroup}
            isCollapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
          />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              alignItems: 'center',
              paddingRight: 5,
            }}
          >
            <View style={{ width: columnWidth, alignItems: 'flex-end' }}>
              <CspAmountCell
                amount={totalTarget}
                percentage={targetPercentage}
                dimIfZero={totalTarget === 0}
                isIncome
              />
            </View>
            <View style={{ width: columnWidth, alignItems: 'flex-end' }}>
              <CspAmountCell
                amount={totalSpent}
                percentage={spentPercentage}
                targetAmount={totalTarget}
                spentAmount={totalSpent}
                dimIfZero={totalSpent === 0}
                isIncome
              />
            </View>
          </View>
        </View>
        <IncomeCategoryList
          categories={categories}
          month={month}
          onEditCategory={onEditCategory}
          onBudgetAction={onBudgetAction}
        />
      </Card>
    </View>
  );
}

type CspBudgetTableHeaderProps = {
  month: string;
  show3Columns?: boolean;
  onShowBudgetSummary: () => void;
};

function CspBudgetTableHeader({
  month,
  show3Columns,
  onShowBudgetSummary,
}: CspBudgetTableHeaderProps) {
  const { t } = useTranslation();
  const sidebarColumnWidth = getColumnWidth({ show3Columns, isSidebar: true });
  const columnWidth = getColumnWidth({ show3Columns });

  // Get total net worth
  const netWorth = useContext(CspNetWorthContext);

  return (
    <View
      data-testid="budget-table-header"
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
        height: 50,
        paddingLeft: 10,
        paddingRight: 15,
        backgroundColor: monthUtils.isCurrentMonth(month)
          ? theme.budgetHeaderCurrentMonth
          : theme.budgetHeaderOtherMonth,
        borderBottomWidth: 1,
        borderColor: theme.tableBorder,
      }}
    >
      <View
        style={{
          width: sidebarColumnWidth,
          flexDirection: 'row',
          justifyContent: 'flex-start',
          alignItems: 'center',
        }}
      >
        <Button variant="bare" onPress={onShowBudgetSummary}>
          <View style={{ alignItems: 'flex-start' }}>
            <Label
              title={t('Net Worth')}
              style={{
                color: theme.formInputText,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            />
            <Text
              style={{
                ...styles.tnum,
                fontSize: 12,
                fontWeight: '700',
                color:
                  netWorth >= 0
                    ? theme.toBudgetPositive
                    : theme.toBudgetNegative,
              }}
            >
              {integerToCurrency(netWorth)}
            </Text>
          </View>
          <SvgCheveronRight
            style={{
              flexShrink: 0,
              color: theme.mobileHeaderTextSubdued,
              marginLeft: 5,
            }}
            width={14}
            height={14}
          />
        </Button>
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}
      >
        <View style={{ width: columnWidth, alignItems: 'flex-end' }}>
          <Label
            title={t('Target')}
            style={{ color: theme.formInputText, paddingRight: 4 }}
          />
        </View>
        <View style={{ width: columnWidth, alignItems: 'flex-end' }}>
          <Label
            title={t('Spent')}
            style={{ color: theme.formInputText, paddingRight: 4 }}
          />
        </View>
      </View>
    </View>
  );
}

export function MobileCspPage() {
  const currentMonth = monthUtils.currentMonth();
  const spreadsheet = useSpreadsheet();
  const dispatch = useDispatch();

  const [startMonthPref, setStartMonthPref] = useLocalPref('budget.startMonth');
  const startMonth = startMonthPref || currentMonth;
  const [bounds, setBounds] = useState({
    start: startMonth,
    end: startMonth,
  });
  const [budgetType = 'envelope'] = useSyncedPref('budgetType');
  const [initialized, setInitialized] = useState(false);

  const categoryGroups = useCspCategoryGroups();

  // Fetch actuals for the current view month
  const { data: actuals = {}, refetch: refetchActuals } =
    useCspActualsForMonth(startMonth);

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

  const onPrevMonth = () => {
    void onMonthSelect(monthUtils.prevMonth(startMonth), 1);
  };

  const onNextMonth = () => {
    void onMonthSelect(monthUtils.nextMonth(startMonth), 1);
  };

  const onOpenBudgetMonthMenu = () => {
    dispatch(
      pushModal({
        modal: {
          name:
            budgetType === 'tracking'
              ? 'tracking-budget-month-menu'
              : 'envelope-budget-month-menu',
          options: {
            month: startMonth,
            onBudgetAction: () => {
              /* noop */
            },
            onEditNotes: () => {
              /* noop */
            },
          },
        },
      }),
    );
  };

  const onShowBudgetSummary = () => {
    dispatch(
      pushModal({
        modal: {
          name: 'csp-budget-summary',
          options: {
            month: startMonth,
          },
        },
      }),
    );
  };

  const onRefresh = async () => {
    await refetchActuals();
  };

  // Calculate Net Income dynamically for percentages
  const audits = useCspAudits();
  const incomeGroup = categoryGroups.find(g =>
    g.name.toLowerCase().includes('income'),
  );
  const { data: targets = {} } = useCspTargetsForMonth(startMonth);

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

  // Calculate Net Worth totals for the header/modal
  const [accountTypesRaw] = useSyncedPref('csp-account-types');
  const accountTypes = useMemo(() => {
    return accountTypesRaw ? JSON.parse(accountTypesRaw) : {};
  }, [accountTypesRaw]);

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
      (data as Array<{ account: string; sum: number }>).forEach(row => {
        res[row.account] = row.sum;
      });
      return res;
    },
  });

  const netWorth = useMemo(() => {
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

    return savingsTotal + investmentsTotal + assetsTotal + debtTotal;
  }, [accounts, balances, accountTypes]);

  const cspOverrides = useMemo(
    () => ({
      ExpenseCategoryListItem: CspMobileCategoryListItem,
      ExpenseGroupListItem: CspExpenseGroupListItem,
      IncomeCategoryListItem: CspMobileCategoryListItem,
      IncomeGroup: CspIncomeGroup,
      BudgetTableHeader: CspBudgetTableHeader,
    }),
    [],
  );

  if (!initialized || categoryGroups.length === 0) {
    return null;
  }

  const BudgetProvider =
    budgetType === 'tracking' ? TrackingBudgetProvider : EnvelopeBudgetProvider;

  return (
    <MobileBudgetComponentsProvider value={cspOverrides}>
      <CategoriesOverrideProvider value={categoryGroups}>
        <CspTargetsContext.Provider value={targets}>
          <CspActualsContext.Provider value={actuals}>
            <CspNetIncomeContext.Provider value={netIncome}>
              <CspNetWorthContext.Provider value={netWorth}>
                <SheetNameProvider name={monthUtils.sheetForMonth(startMonth)}>
                  <BudgetProvider
                    summaryCollapsed={false}
                    onBudgetAction={() => {
                      /* noop */
                    }}
                    onToggleSummaryCollapse={() => {
                      /* noop */
                    }}
                  >
                    <Page
                      padding={0}
                      header={
                        <MobilePageHeader
                          title={
                            <MonthSelector
                              month={startMonth}
                              monthBounds={bounds}
                              onOpenMonthMenu={onOpenBudgetMonthMenu}
                              onPrevMonth={onPrevMonth}
                              onNextMonth={onNextMonth}
                            />
                          }
                        />
                      }
                    >
                      <SyncRefresh onSync={onRefresh}>
                        {({ onRefresh: onRefreshSync }) => (
                          <BudgetTable
                            categoryGroups={categoryGroups}
                            month={startMonth}
                            onShowBudgetSummary={onShowBudgetSummary}
                            onBudgetAction={() => {
                              /* noop */
                            }}
                            onRefresh={onRefreshSync}
                            onEditCategoryGroup={() => {
                              /* noop */
                            }}
                            onEditCategory={() => {
                              /* noop */
                            }}
                          />
                        )}
                      </SyncRefresh>
                    </Page>
                  </BudgetProvider>
                </SheetNameProvider>
              </CspNetWorthContext.Provider>
            </CspNetIncomeContext.Provider>
          </CspActualsContext.Provider>
        </CspTargetsContext.Provider>
      </CategoriesOverrideProvider>
    </MobileBudgetComponentsProvider>
  );
}
