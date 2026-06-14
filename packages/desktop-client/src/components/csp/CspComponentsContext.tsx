import { createContext, useContext } from 'react';

import type { BudgetComponents } from '../budget';

/**
 * Context that allows the CSP page to override the budget components
 * used by shared Budget table infrastructure (ExpenseGroup, ExpenseCategory, etc.).
 *
 * When this context provides a non-null value, useBudgetComponents() in
 * budget/index.tsx will use these components instead of the envelope/tracking ones.
 */
const CspComponentsContext = createContext<BudgetComponents | null>(null);

export const CspComponentsProvider = CspComponentsContext.Provider;

export function useCspBudgetComponents(): BudgetComponents | null {
  return useContext(CspComponentsContext);
}
