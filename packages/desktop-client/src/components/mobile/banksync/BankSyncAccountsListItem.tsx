import { useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Select } from '@actual-app/components/select';
import { SpaceBetween } from '@actual-app/components/space-between';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { tsToRelativeTime } from '@actual-app/core/shared/util';
import type { AccountEntity } from '@actual-app/core/types/models';

import { useLocale } from '#hooks/useLocale';
import { useSyncedPref } from '#hooks/useSyncedPref';

type BankSyncAccountsListItemProps = {
  account: AccountEntity;
  onAction: (account: AccountEntity, action: 'link' | 'edit') => void;
  isLinked: boolean;
};

export function BankSyncAccountsListItem({
  account,
  onAction,
  isLinked,
}: BankSyncAccountsListItemProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [accountTypesRaw, setAccountTypes] = useSyncedPref('csp-account-types');
  const accountTypes: Record<string, string> = useMemo(
    () => (accountTypesRaw ? JSON.parse(accountTypesRaw) : {}),
    [accountTypesRaw],
  );

  const accountTypeOptions: Array<[string, string]> = useMemo(
    () => [
      ['auto', t('Uncategorized')],
      ['savings', t('Savings')],
      ['investments', t('Investments')],
      ['assets', t('Assets')],
      ['debt', t('Debt')],
    ],
    [t],
  );

  const currentAccountType = accountTypes[account.id] || 'auto';

  const onSelectAccountType = (newType: string) => {
    const updated = { ...accountTypes };
    if (newType === 'auto') {
      delete updated[account.id];
    } else {
      updated[account.id] = newType;
    }
    setAccountTypes(JSON.stringify(updated));
  };

  const lastSyncString = isLinked
    ? tsToRelativeTime(account.last_sync, locale, {
        capitalize: true,
      })
    : null;

  return (
    <View
      data-testid="bank-sync-account"
      style={{
        backgroundColor: theme.tableBackground,
        borderBottomWidth: 1,
        borderBottomColor: theme.tableBorder,
        borderBottomStyle: 'solid',
        padding: 16,
        width: '100%',
        cursor: 'pointer',
      }}
      onClick={() => onAction(account, isLinked ? 'edit' : 'link')}
    >
      <SpaceBetween gap={20}>
        <SpaceBetween
          direction="vertical"
          gap={5}
          style={{ flex: 1, alignItems: 'flex-start' }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: theme.tableText,
            }}
          >
            {account.name}
          </Text>
          {isLinked && (
            <Text
              style={{
                fontSize: 13,
                color: theme.pageTextSubdued,
              }}
            >
              {account.bankName ?? t('Unknown')}
            </Text>
          )}
          {isLinked && lastSyncString && (
            <Text
              style={{
                fontSize: 13,
                color: theme.pageTextSubdued,
              }}
              data-vrt-mask
            >
              <Trans>Last sync: {{ time: lastSyncString }}</Trans>
            </Text>
          )}
          <View
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              marginTop: 4,
            }}
            onClick={e => e.stopPropagation()}
          >
            <Text
              style={{
                fontSize: 13,
                color: theme.pageTextSubdued,
              }}
            >
              <Trans>Account type:</Trans>
            </Text>
            <Select
              options={accountTypeOptions}
              value={currentAccountType}
              onChange={onSelectAccountType}
              style={{ width: 140 }}
            />
          </View>
        </SpaceBetween>

        <span
          style={{
            borderRadius: 4,
            padding: '5px 10px',
            backgroundColor: theme.noticeBackground,
            border: '1px solid ' + theme.noticeBackground,
            color: theme.noticeTextDark,
            fontSize: 13,
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {isLinked ? <Trans>Edit</Trans> : <Trans>Link account</Trans>}
        </span>
      </SpaceBetween>
    </View>
  );
}
