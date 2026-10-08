import React, { useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Popover } from '@actual-app/components/popover';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { integerToCurrency } from '@actual-app/core/shared/util';

import { ClickableCell } from '#components/budget/ClickableCell';
import { RenderMonths } from '#components/budget/RenderMonths';
import { Field, Row } from '#components/table';
import { useGlobalPref } from '#hooks/useGlobalPref';

import {
  getCspSpentAmount,
  getCspTargetAmount,
  useCspMonthData,
} from './index';

function CspFooterSidebar() {
  const [categoryExpandedStatePref] = useGlobalPref('categoryExpandedState');
  const categoryExpandedState = categoryExpandedStatePref ?? 0;

  return (
    <View
      style={{
        width: 200 + 100 * categoryExpandedState,
        backgroundColor: theme.budgetHeaderCurrentMonth,
        paddingLeft: 12,
        paddingRight: 10,
        justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontWeight: 600 }}>
          <Trans>Net Cash Flow</Trans>
        </Text>
      </View>
    </View>
  );
}

function CspFooterMonth({ month }: { month: string }) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const { actuals, targets, audits, netIncome, categoryGroups } =
    useCspMonthData(month);

  const guiltFreeGroup = categoryGroups.find(g =>
    g.name.toLowerCase().includes('guilt-free'),
  );
  const otherGroups = categoryGroups.filter(
    g =>
      !g.name.toLowerCase().includes('income') &&
      !g.name.toLowerCase().includes('guilt-free'),
  );

  const otherGroupsBreakdown = otherGroups.map(group => {
    const target = (group.categories ?? []).reduce(
      (sum, cat) => sum + getCspTargetAmount(cat, categoryGroups, targets),
      0,
    );
    const spent = (group.categories ?? []).reduce(
      (sum, cat) =>
        sum + getCspSpentAmount(cat, actuals, audits, categoryGroups),
      0,
    );
    return { group, target, spent };
  });

  const otherSpentTotal = otherGroupsBreakdown.reduce(
    (sum, item) => sum + item.spent,
    0,
  );
  const otherTargetTotal = otherGroupsBreakdown.reduce(
    (sum, item) => sum + item.target,
    0,
  );

  const guiltFreeTarget = guiltFreeGroup
    ? (guiltFreeGroup.categories ?? []).reduce(
        (sum, cat) => sum + getCspTargetAmount(cat, categoryGroups, targets),
        0,
      )
    : 0;

  const guiltFreeSpent = guiltFreeGroup
    ? (guiltFreeGroup.categories ?? []).reduce(
        (sum, cat) =>
          sum + getCspSpentAmount(cat, actuals, audits, categoryGroups),
        0,
      )
    : 0;

  const totalTargetExpenses = otherTargetTotal + guiltFreeTarget;
  const plannedNet = netIncome.target - totalTargetExpenses;

  const totalSpentExpenses = otherSpentTotal + guiltFreeSpent;
  const actualNet = netIncome.spent - totalSpentExpenses;

  const availableGuiltFree = Math.max(0, netIncome.spent - otherSpentTotal);

  const plannedPercentage =
    netIncome.target > 0 ? (plannedNet / netIncome.target) * 100 : undefined;
  const actualPercentage =
    netIncome.spent > 0 ? (actualNet / netIncome.spent) * 100 : undefined;

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
        <Tooltip
          content={t('Planned Net Remainder (Income - Planned Allocations)')}
        >
          <View
            style={{
              paddingRight: styles.monthRightPadding,
              flexDirection: 'row',
              justifyContent: 'flex-end',
              alignItems: 'center',
              width: '100%',
              height: '100%',
            }}
          >
            {plannedPercentage !== undefined && (
              <Text
                style={{
                  fontSize: 11,
                  color: theme.pageTextSubdued,
                  marginRight: 6,
                }}
              >
                {plannedPercentage.toFixed(1)}%
              </Text>
            )}
            <Text
              style={{
                ...styles.tnum,
                textAlign: 'right',
                color: theme.pageTextSubdued,
              }}
            >
              {integerToCurrency(plannedNet)}
            </Text>
          </View>
        </Tooltip>
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
          onClick={() => setIsOpen(true)}
        >
          <Tooltip
            content={t('Click to view cash flow breakdown')}
            placement="bottom"
          >
            <View
              innerRef={triggerRef}
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                alignItems: 'center',
                width: '100%',
              }}
            >
              {actualPercentage !== undefined && (
                <Text
                  style={{
                    fontSize: 11,
                    color:
                      actualNet > 0
                        ? theme.noticeText
                        : actualNet < 0
                          ? theme.errorText
                          : theme.pageTextSubdued,
                    marginRight: 6,
                  }}
                >
                  {actualNet > 0 ? '+' : ''}
                  {actualPercentage.toFixed(1)}%
                </Text>
              )}
              <Text
                style={{
                  ...styles.tnum,
                  textAlign: 'right',
                  fontWeight: 600,
                  color:
                    actualNet > 0
                      ? theme.toBudgetPositive
                      : actualNet < 0
                        ? theme.toBudgetNegative
                        : theme.pageTextSubdued,
                }}
              >
                {actualNet > 0 ? '+' : ''}
                {integerToCurrency(actualNet)}
              </Text>
            </View>
          </Tooltip>
        </ClickableCell>

        {isOpen && (
          <Popover
            triggerRef={triggerRef}
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            placement="bottom end"
            style={{
              padding: 16,
              minWidth: 280,
              maxWidth: 340,
            }}
          >
            <View style={{ gap: 10 }}>
              <View
                style={{
                  borderBottom: `1px solid ${theme.tableBorder}`,
                  paddingBottom: 8,
                }}
              >
                <Text style={{ fontWeight: 'bold', fontSize: 13 }}>
                  {monthUtils.format(month, 'MMMM yyyy')}{' '}
                  <Trans>Net Cash Flow</Trans>
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: theme.pageTextSubdued,
                    marginTop: 2,
                  }}
                >
                  <Trans>Monthly income vs. actual expenses</Trans>
                </Text>
              </View>

              {/* Income */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 12 }}>
                  <Trans>Actual Income</Trans>
                </Text>
                <Text
                  style={{
                    ...styles.tnum,
                    fontSize: 12,
                    fontWeight: 600,
                    color: theme.toBudgetPositive,
                  }}
                >
                  +{integerToCurrency(netIncome.spent)}
                </Text>
              </View>

              {/* Other Groups */}
              {otherGroupsBreakdown.map(({ group, spent }) => (
                <View
                  key={group.id}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                    {group.name}
                  </Text>
                  <Text
                    style={{
                      ...styles.tnum,
                      fontSize: 12,
                      color: theme.pageTextSubdued,
                    }}
                  >
                    -{integerToCurrency(spent)}
                  </Text>
                </View>
              ))}

              {/* Available for Guilt-Free Spending Highlight */}
              <View
                style={{
                  borderTop: `1px dashed ${theme.tableBorder}`,
                  borderBottom: `1px dashed ${theme.tableBorder}`,
                  paddingTop: 6,
                  paddingBottom: 6,
                  marginTop: 2,
                  marginBottom: 2,
                  backgroundColor: theme.budgetCurrentMonth,
                  paddingLeft: 6,
                  paddingRight: 6,
                  borderRadius: 4,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: 600 }}>
                  <Trans>Available for Guilt-Free</Trans>
                </Text>
                <Text
                  style={{
                    ...styles.tnum,
                    fontSize: 12,
                    fontWeight: 600,
                    color: theme.tableText,
                  }}
                >
                  {integerToCurrency(availableGuiltFree)}
                </Text>
              </View>

              {/* Guilt-Free Spent */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                  {guiltFreeGroup?.name || <Trans>Guilt-Free Spending</Trans>}
                </Text>
                <Text
                  style={{
                    ...styles.tnum,
                    fontSize: 12,
                    color: theme.pageTextSubdued,
                  }}
                >
                  -{integerToCurrency(guiltFreeSpent)}
                </Text>
              </View>

              {/* Net Surplus / Deficit */}
              <View
                style={{
                  borderTop: `1px solid ${theme.tableBorder}`,
                  paddingTop: 8,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontWeight: 'bold', fontSize: 13 }}>
                  {actualNet >= 0 ? (
                    <Trans>Net Surplus</Trans>
                  ) : (
                    <Trans>Net Deficit</Trans>
                  )}
                </Text>
                <Text
                  style={{
                    ...styles.tnum,
                    fontWeight: 'bold',
                    fontSize: 14,
                    color:
                      actualNet > 0
                        ? theme.toBudgetPositive
                        : actualNet < 0
                          ? theme.toBudgetNegative
                          : theme.tableText,
                  }}
                >
                  {actualNet > 0 ? '+' : ''}
                  {integerToCurrency(actualNet)}
                </Text>
              </View>

              <Text
                style={{
                  fontSize: 11,
                  color: theme.pageTextSubdued,
                  fontStyle: 'italic',
                }}
              >
                {actualNet >= 0
                  ? t('You spent less than you made this month.')
                  : t('You spent more than you made this month.')}
              </Text>
            </View>
          </Popover>
        )}
      </Field>
    </View>
  );
}

export function CspFooterRow() {
  return (
    <Row
      collapsed
      style={{
        fontWeight: 600,
        backgroundColor: theme.budgetHeaderCurrentMonth,
        borderTop: `1px solid ${theme.tableBorder}`,
        borderBottom: `1px solid ${theme.tableBorder}`,
      }}
    >
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
        }}
      >
        <CspFooterSidebar />
        <RenderMonths>
          {({ month }) => <CspFooterMonth month={month} />}
        </RenderMonths>
      </View>
    </Row>
  );
}
