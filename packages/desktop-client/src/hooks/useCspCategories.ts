import { send } from '@actual-app/core/platform/client/connection';
import { q } from '@actual-app/core/shared/query';
import { useQuery } from '@tanstack/react-query';
import type { CSPCategoryEntity } from '@actual-app/core/types/models';

export function useCspCategories() {
  return useQuery({
    queryKey: ['csp-categories'],
    queryFn: async () => {
      const { data } = await send(
        'query',
        q('csp_categories').select('*').serialize(),
      );
      return { list: (data || []) as CSPCategoryEntity[] };
    },
  });
}
