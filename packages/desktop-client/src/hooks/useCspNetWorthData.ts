import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { AccountEntity } from '@actual-app/core/types/models';

import { getCspNetWorthData } from '#components/reports/util';

import { useSyncedPref } from './useSyncedPref';

type NetWorthData = {
  graphData: {
    data: Array<Record<string, unknown>>;
    hasNegative: boolean;
    start: string;
    end: string;
  };
  accounts: { id: string; name: string }[];
  netWorth: number;
  totalChange: number;
};

export function useCspNetWorthData<T extends NetWorthData>(
  data: T | null | undefined,
  accounts: AccountEntity[],
  cspMode: boolean,
  liquidOnly?: boolean,
): T | null {
  const { t } = useTranslation();
  const [accountTypesRaw] = useSyncedPref('csp-account-types');

  const accountTypes = useMemo(() => {
    return accountTypesRaw ? JSON.parse(accountTypesRaw) : {};
  }, [accountTypesRaw]);

  return useMemo(() => {
    if (!data) return null;
    if (!cspMode) return data;

    const {
      graphData: newGraphData,
      accounts: newAccounts,
      netWorth,
      totalChange,
    } = getCspNetWorthData(
      data.graphData,
      accounts,
      accountTypes,
      t,
      liquidOnly,
    );

    return {
      ...data,
      graphData: newGraphData,
      accounts: newAccounts,
      netWorth: netWorth !== undefined ? netWorth : data.netWorth,
      totalChange: totalChange !== undefined ? totalChange : data.totalChange,
    };
  }, [data, cspMode, liquidOnly, accounts, accountTypes, t]);
}
