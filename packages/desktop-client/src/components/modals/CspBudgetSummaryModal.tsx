import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import { q } from '@actual-app/core/shared/query';
import { integerToCurrency } from '@actual-app/core/shared/util';
import { useQuery } from '@tanstack/react-query';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { useAccounts } from '#hooks/useAccounts';
import { useSyncedPref } from '#hooks/useSyncedPref';
import type { Modal as ModalType } from '#modals/modalsSlice';

type CspBudgetSummaryModalProps = Extract<
  ModalType,
  { name: 'csp-budget-summary' }
>['options'];

export function CspBudgetSummaryModal(_props: CspBudgetSummaryModalProps) {
  const { t } = useTranslation();

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
      (data as Array<{ account: string; sum: number }>).forEach(row => {
        res[row.account] = row.sum;
      });
      return res;
    },
  });

  let savingsTotal = 0;
  let investmentsTotal = 0;
  let debtTotal = 0;

  accounts
    .filter(a => !a.closed)
    .forEach(a => {
      const bal = balances[a.id] || 0;
      const type = accountTypes[a.id];

      if (type === 'savings') savingsTotal += bal;
      else if (type === 'investments') investmentsTotal += bal;
      else if (type === 'debt') debtTotal += bal;
    });

  const netWorth = savingsTotal + investmentsTotal + debtTotal;

  return (
    <Modal name="csp-budget-summary">
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Net Worth Summary')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ padding: '20px 15px', gap: 15 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottomWidth: 1,
                borderColor: theme.tableBorder,
              }}
            >
              <Text style={{ fontWeight: 500 }}>
                <Trans>Investments</Trans>
              </Text>
              <Text style={{ ...styles.tnum, fontWeight: 500 }}>
                {integerToCurrency(investmentsTotal)}
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottomWidth: 1,
                borderColor: theme.tableBorder,
              }}
            >
              <Text style={{ fontWeight: 500 }}>
                <Trans>Savings</Trans>
              </Text>
              <Text style={{ ...styles.tnum, fontWeight: 500 }}>
                {integerToCurrency(savingsTotal)}
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottomWidth: 1,
                borderColor: theme.tableBorder,
              }}
            >
              <Text style={{ fontWeight: 500 }}>
                <Trans>Debt</Trans>
              </Text>
              <Text
                style={{
                  ...styles.tnum,
                  fontWeight: 500,
                  color: debtTotal < 0 ? theme.errorText : theme.tableText,
                }}
              >
                {integerToCurrency(debtTotal)}
              </Text>
            </View>

            <View
              style={{
                alignItems: 'center',
                marginTop: 20,
                padding: 15,
                backgroundColor: theme.budgetHeaderCurrentMonth,
                borderRadius: 6,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: theme.pageTextSubdued,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  marginBottom: 5,
                }}
              >
                {netWorth < 0 ? t('Net Debt') : t('Total Net Worth')}
              </Text>
              <Text
                style={{
                  ...styles.veryLargeText,
                  fontWeight: '700',
                  color:
                    netWorth > 0
                      ? theme.toBudgetPositive
                      : netWorth < 0
                        ? theme.toBudgetNegative
                        : theme.toBudgetZero,
                }}
              >
                {integerToCurrency(netWorth)}
              </Text>
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
