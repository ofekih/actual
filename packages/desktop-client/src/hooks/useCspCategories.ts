import { send } from '@actual-app/core/platform/client/connection';
import { q } from '@actual-app/core/shared/query';
import type {
  CSPCategoryEntity,
  CSPCategoryGroupEntity,
} from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

export type CspCategoryGroupWithCategories = CSPCategoryGroupEntity & {
  categories: CSPCategoryEntity[];
};

const queryKey = ['csp-categories'];

const queryFn = async () => {
  const [{ data: categories }, { data: groups }] = await Promise.all([
    send('query', q('csp_categories').select('*').serialize()),
    send('query', q('csp_category_groups').select('*').serialize()),
  ]);
  const list = (categories || []) as CSPCategoryEntity[];
  const groupList = (groups || []) as CSPCategoryGroupEntity[];
  const grouped: CspCategoryGroupWithCategories[] = groupList.map(g => ({
    ...g,
    categories: list.filter(c => c.group === g.id),
  }));
  return { list, grouped };
};

export function useCspCategories() {
  return useQuery({
    queryKey,
    queryFn,
  });
}

export function useCspCategory(id?: string | null) {
  return useQuery({
    queryKey,
    queryFn,
    select: data => data.list.find(c => c.id === id),
    enabled: !!id,
  });
}
