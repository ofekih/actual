import { createContext, useContext } from 'react';

export type CspAudit = {
  average: number;
  deviation: number;
  flag: '5-more' | '10-more' | '5-less' | '10-less' | null;
};

export const CspAuditsContext = createContext<Record<string, CspAudit>>({});

export function useCspAudits() {
  return useContext(CspAuditsContext);
}
