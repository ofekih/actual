import { useEffect, useState } from 'react';

import { send } from '@actual-app/core/platform/client/connection';

import { useSyncServerStatus } from './useSyncServerStatus';

export function useAutohubStatus() {
  const [configuredAutohub, setConfiguredAutohub] = useState<boolean | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const status = useSyncServerStatus();

  useEffect(() => {
    async function fetch() {
      setIsLoading(true);

      const results = await send('autohub-status');

      setConfiguredAutohub(results.configured || false);
      setIsLoading(false);
    }

    if (status === 'online') {
      void fetch();
    }
  }, [status]);

  return {
    configuredAutohub,
    isLoading,
  };
}
