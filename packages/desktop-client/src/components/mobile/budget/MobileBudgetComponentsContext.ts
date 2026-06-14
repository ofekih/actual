import { createContext, useContext } from 'react';
import type { ComponentType } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MobileBudgetComponents = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ExpenseCategoryListItem?: ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ExpenseGroupListItem?: ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  IncomeCategoryListItem?: ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  IncomeGroup?: ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BudgetTableHeader?: ComponentType<any>;
};

const MobileBudgetComponentsContext =
  createContext<MobileBudgetComponents | null>(null);

export const MobileBudgetComponentsProvider =
  MobileBudgetComponentsContext.Provider;

export function useMobileBudgetComponents(): MobileBudgetComponents | null {
  return useContext(MobileBudgetComponentsContext);
}
