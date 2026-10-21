import { Navigate } from 'react-router';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';

import { LoadingIndicator } from '#components/reports/LoadingIndicator';
import { useAccounts } from '#hooks/useAccounts';
import { useSidebarMenu } from '#hooks/useSidebarMenu';

export function StartPageRedirect() {
  const { isNarrowWidth } = useResponsive();
  const { startPath } = useSidebarMenu();
  const { data: accounts, isFetching: isAccountsFetching } = useAccounts();

  if (isAccountsFetching || !accounts) {
    return <LoadingIndicator />;
  }

  // If there are no accounts, we want to redirect the user to the All
  // Accounts screen which will prompt them to add an account
  if (accounts.length === 0) {
    return <Navigate to="/accounts" replace />;
  }

  return <Navigate to={isNarrowWidth ? '/csp' : startPath} replace />;
}
