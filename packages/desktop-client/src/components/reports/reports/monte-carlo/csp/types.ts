export type TimeAxis = 'age' | 'year';

export type CspInvestmentAccount = {
  id: string;
  name: string;
  balance: number;
  type: string;
};

export type CspInvestmentCategory = {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  monthlyTarget: number;
  annualPlanned: number;
  trailing12MonthActual: number;
};

export type CspLivingExpenses = {
  fixedCostsMonthly: number;
  guiltFreeMonthly: number;
  totalMonthly: number;
  totalAnnual: number;
};

export type InvestmentHistoryPoint = {
  date: string;
  year: number;
  balance: number;
};
