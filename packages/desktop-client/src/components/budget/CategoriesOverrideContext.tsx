import { createContext, useContext } from 'react';

import type { CategoryGroupEntity } from '@actual-app/core/types/models';

/**
 * When provided, BudgetTable will use these category groups instead of
 * fetching from useCategories(). This allows the CSP page to inject
 * CSP categories mapped to the CategoryGroupEntity shape.
 */
const CategoriesOverrideContext = createContext<CategoryGroupEntity[] | null>(
  null,
);

export const CategoriesOverrideProvider = CategoriesOverrideContext.Provider;

export function useCategoriesOverride(): CategoryGroupEntity[] | null {
  return useContext(CategoriesOverrideContext);
}
