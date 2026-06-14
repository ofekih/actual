import { createContext, useContext } from 'react';
import type { ComponentType } from 'react';

export type MobileBudgetComponents = {
  ExpenseCategoryListItem?: ComponentType<any>;
  ExpenseGroupListItem?: ComponentType<any>;
  IncomeCategoryListItem?: ComponentType<any>;
  IncomeGroup?: ComponentType<any>;
  BudgetTableHeader?: ComponentType<any>;
};

const MobileBudgetComponentsContext =
  createContext<MobileBudgetComponents | null>(null);

export const MobileBudgetComponentsProvider =
  MobileBudgetComponentsContext.Provider;

export function useMobileBudgetComponents(): MobileBudgetComponents | null {
  return useContext(MobileBudgetComponentsContext);
}
