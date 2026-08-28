import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { AccountEntity } from '@actual-app/core/types/models';

import { useMoveAccountMutation, useUpdateAccountMutation } from '#accounts';
import { isAccountFailedSync } from '#accounts/syncStatus';
import { useAccounts } from '#hooks/useAccounts';
import { useClosedAccounts } from '#hooks/useClosedAccounts';
import { useLocalPref } from '#hooks/useLocalPref';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { useUpdatedAccounts } from '#hooks/useUpdatedAccounts';
import { useSelector } from '#redux';
import * as bindings from '#spreadsheet/bindings';

import { Account } from './Account';
import { SecondaryItem } from './SecondaryItem';

const fontWeight = 600;

type CspCategory = 'savings' | 'debt' | 'investments' | 'assets';

function getAccountCspCategory(
  account: AccountEntity,
  accountTypes: Record<string, string>,
): CspCategory {
  const type = accountTypes[account.id];
  if (
    type === 'savings' ||
    type === 'debt' ||
    type === 'investments' ||
    type === 'assets'
  ) {
    return type;
  }
  if (!account.offbudget) {
    return 'savings';
  }
  return 'assets';
}

export function Accounts() {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const { data: accounts = [] } = useAccounts();
  const updatedAccounts = useUpdatedAccounts();
  const { data: closedAccounts = [] } = useClosedAccounts();
  const syncingAccountIds = useSelector(state => state.account.accountsSyncing);
  const [accountTypesRaw, setAccountTypes] = useSyncedPref('csp-account-types');
  const accountTypes: Record<string, string> = useMemo(
    () => (accountTypesRaw ? JSON.parse(accountTypesRaw) : {}),
    [accountTypesRaw],
  );

  const getAccountPath = (account: AccountEntity) => `/accounts/${account.id}`;

  const [showClosedAccounts, setShowClosedAccountsPref] = useLocalPref(
    'ui.showClosedAccounts',
  );

  const categories: Array<{
    id: CspCategory;
    name: string;
    testId: string;
  }> = useMemo(
    () => [
      { id: 'savings', name: t('Savings'), testId: 'sidebar-savings-balance' },
      { id: 'debt', name: t('Debt'), testId: 'sidebar-debt-balance' },
      {
        id: 'investments',
        name: t('Investments'),
        testId: 'sidebar-investments-balance',
      },
      { id: 'assets', name: t('Assets'), testId: 'sidebar-assets-balance' },
    ],
    [t],
  );

  const openAccounts = useMemo(
    () => accounts.filter(account => !account.closed),
    [accounts],
  );

  const accountsByCategory = useMemo(() => {
    const grouped: Record<CspCategory, AccountEntity[]> = {
      savings: [],
      debt: [],
      investments: [],
      assets: [],
    };

    openAccounts.forEach(account => {
      const cat = getAccountCspCategory(account, accountTypes);
      grouped[cat].push(account);
    });

    return grouped;
  }, [openAccounts, accountTypes]);

  function onDragChange(drag: { state: string }) {
    setIsDragging(drag.state === 'start');
  }

  const moveAccount = useMoveAccountMutation();
  const updateAccount = useUpdateAccountMutation();

  const makeDropPadding = (i: number) => {
    if (i === 0) {
      return {
        paddingTop: isDragging ? 15 : 0,
        marginTop: isDragging ? -15 : 0,
      };
    }
    return undefined;
  };

  async function onReorder(
    id: string,
    dropPos: 'top' | 'bottom' | null,
    targetId: string,
  ) {
    const movedAccount = accounts.find(a => a.id === id);
    const targetAccount = accounts.find(a => a.id === targetId);

    if (movedAccount && targetAccount) {
      const sourceCategory = getAccountCspCategory(movedAccount, accountTypes);
      const targetCategory = getAccountCspCategory(targetAccount, accountTypes);

      if (sourceCategory !== targetCategory) {
        // Update CSP Category in synced preferences
        const newAccountTypes = { ...accountTypes, [id]: targetCategory };
        setAccountTypes(JSON.stringify(newAccountTypes));

        // Update offbudget status implicitly
        const newOffbudget =
          targetCategory === 'savings'
            ? 0
            : targetCategory === 'investments' || targetCategory === 'assets'
              ? 1
              : movedAccount.offbudget;

        if (movedAccount.offbudget !== newOffbudget) {
          updateAccount.mutate({
            account: {
              ...movedAccount,
              offbudget: newOffbudget,
            },
          });
        }
      }
    }

    let targetIdToMove: string | null = targetId;
    if (dropPos === 'bottom') {
      const idx = accounts.findIndex(a => a.id === targetId) + 1;
      targetIdToMove = idx < accounts.length ? accounts[idx].id : null;
    }

    moveAccount.mutate({ id, targetId: targetIdToMove });
  }

  const onToggleClosedAccounts = () => {
    setShowClosedAccountsPref(!showClosedAccounts);
  };

  return (
    <View
      style={{
        flexGrow: 1,
        '@media screen and (max-height: 480px)': {
          minHeight: 'auto',
        },
      }}
    >
      <View
        style={{
          height: 1,
          backgroundColor: theme.sidebarItemBackgroundHover,
          marginTop: 15,
          flexShrink: 0,
        }}
      />

      <View style={{ overflow: 'auto' }}>
        <Account
          name={t('All accounts')}
          to="/accounts"
          query={bindings.allAccountBalance()}
          style={{ fontWeight, marginTop: 15 }}
          isExactPathMatch
          balanceTestId="sidebar-all-accounts-balance"
        />

        {categories.map(category => {
          const categoryAccounts = accountsByCategory[category.id];
          if (categoryAccounts.length === 0) {
            return null;
          }

          return (
            <Fragment key={category.id}>
              <Account
                name={category.name}
                to="/accounts"
                query={bindings.categoryAccountsBalance(
                  category.id,
                  categoryAccounts.map(a => a.id),
                )}
                style={{
                  fontWeight,
                  marginTop: 13,
                  marginBottom: 5,
                }}
                titleAccount
                balanceTestId={category.testId}
              />

              {categoryAccounts.map((account, i) => (
                <Account
                  key={account.id}
                  name={account.name}
                  account={account}
                  connected={!!account.bank}
                  pending={syncingAccountIds.includes(account.id)}
                  failed={isAccountFailedSync(account)}
                  updated={updatedAccounts.includes(account.id)}
                  to={getAccountPath(account)}
                  query={bindings.accountBalance(account.id)}
                  onDragChange={onDragChange}
                  onDrop={onReorder}
                  outerStyle={makeDropPadding(i)}
                />
              ))}
            </Fragment>
          );
        })}

        {closedAccounts.length > 0 && (
          <SecondaryItem
            style={{ marginTop: 15 }}
            title={
              showClosedAccounts
                ? t('Closed accounts')
                : t('Closed accounts...')
            }
            onClick={onToggleClosedAccounts}
            bold
          />
        )}

        {showClosedAccounts &&
          closedAccounts.map(account => (
            <Account
              key={account.id}
              name={account.name}
              account={account}
              to={getAccountPath(account)}
              query={bindings.accountBalance(account.id)}
              onDragChange={onDragChange}
              onDrop={onReorder}
            />
          ))}
      </View>
    </View>
  );
}
