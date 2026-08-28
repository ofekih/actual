import React, { memo, useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Select } from '@actual-app/components/select';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { tsToRelativeTime } from '@actual-app/core/shared/util';
import type { AccountEntity } from '@actual-app/core/types/models';
import { format as formatDate } from 'date-fns';
import type { Locale } from 'date-fns';

import { Cell, Row } from '#components/table';
import { useSyncedPref } from '#hooks/useSyncedPref';

type AccountRowProps = {
  account: AccountEntity;
  hovered: boolean;
  onHover: (id: AccountEntity['id'] | null) => void;
  onAction: (account: AccountEntity, action: 'link' | 'edit') => void;
  locale: Locale;
};

export const AccountRow = memo(
  ({ account, hovered, onHover, onAction, locale }: AccountRowProps) => {
    const { t } = useTranslation();
    const backgroundFocus = hovered;
    const [accountTypesRaw, setAccountTypes] =
      useSyncedPref('csp-account-types');
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

    // The bank name is stored as null when the sync provider doesn't report an
    // institution; show a localized fallback for linked accounts.
    const bankName =
      account.bank && !account.bankName ? t('Unknown') : account.bankName;

    const lastSyncString = tsToRelativeTime(account.last_sync, locale, {
      capitalize: true,
    });
    const lastSyncDateTime = formatDate(
      new Date(parseInt(account.last_sync ?? '0', 10)),
      'MMM d, yyyy, HH:mm:ss',
      { locale },
    );

    const potentiallyTruncatedAccountName =
      account.name.length > 30
        ? account.name.slice(0, 30) + '...'
        : account.name;

    return (
      <Row
        height="auto"
        style={{
          fontSize: 13,
          backgroundColor: backgroundFocus
            ? theme.tableRowBackgroundHover
            : theme.tableBackground,
        }}
        collapsed
        onMouseEnter={() => onHover && onHover(account.id)}
        onMouseLeave={() => onHover && onHover(null)}
      >
        <Cell
          name="accountName"
          width={account.account_sync_source ? 250 : 'flex'}
          plain
          style={{ color: theme.tableText, padding: '10px' }}
        >
          {potentiallyTruncatedAccountName}
        </Cell>

        {account.account_sync_source && (
          <Cell
            name="bankName"
            width="flex"
            plain
            style={{ color: theme.tableText, padding: '10px' }}
          >
            {bankName}
          </Cell>
        )}

        <Cell
          name="accountType"
          width={160}
          plain
          style={{ padding: '5px 10px' }}
        >
          <Select
            options={accountTypeOptions}
            value={currentAccountType}
            onChange={onSelectAccountType}
            style={{ width: '100%' }}
          />
        </Cell>

        {account.account_sync_source ? (
          <Tooltip
            placement="bottom start"
            content={lastSyncDateTime}
            style={{
              ...styles.tooltip,
            }}
          >
            <Cell
              name="lastSync"
              width={160}
              plain
              style={{
                color: theme.tableText,
                padding: '11px',
                textDecoration: 'underline',
                textDecorationStyle: 'dashed',
                textDecorationColor: theme.pageTextSubdued,
                textUnderlineOffset: '4px',
              }}
              data-vrt-mask
            >
              {lastSyncString}
            </Cell>
          </Tooltip>
        ) : null}

        {account.account_sync_source ? (
          <Cell name="edit" width={100} plain style={{ paddingRight: '10px' }}>
            <Button onPress={() => onAction(account, 'edit')}>
              <Trans>Edit</Trans>
            </Button>
          </Cell>
        ) : (
          <Cell name="link" width={100} plain style={{ paddingRight: '10px' }}>
            <Button onPress={() => onAction(account, 'link')}>
              <Trans>Link account</Trans>
            </Button>
          </Cell>
        )}
      </Row>
    );
  },
);

AccountRow.displayName = 'AccountRow';
