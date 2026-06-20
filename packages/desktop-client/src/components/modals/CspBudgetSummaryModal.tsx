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
import { AccountGroupRow } from '#components/csp/index';
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

  return (
    <Modal name="csp-budget-summary">
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Net Worth Summary')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ padding: '20px 15px', gap: 15 }}>
            <AccountGroupRow
              layout="row-between"
              label={<Trans>Investments</Trans>}
              amount={investmentsTotal}
              accounts={investmentsAccounts}
              balances={balances}
            />

            <AccountGroupRow
              layout="row-between"
              label={<Trans>Savings</Trans>}
              amount={savingsTotal}
              accounts={savingsAccounts}
              balances={balances}
            />

            <AccountGroupRow
              layout="row-between"
              label={<Trans>Assets</Trans>}
              amount={assetsTotal}
              accounts={assetsAccounts}
              balances={balances}
            />

            <AccountGroupRow
              layout="row-between"
              label={<Trans>Debt</Trans>}
              amount={debtTotal}
              accounts={debtAccounts}
              balances={balances}
            />

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
