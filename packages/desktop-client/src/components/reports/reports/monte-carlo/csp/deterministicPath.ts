import { runMonteCarloSimulation } from '#components/reports/reports/monte-carlo/monteCarloSimulation';
import type { MonteCarloParams } from '#components/reports/reports/monte-carlo/monteCarloSimulation';

/**
 * Computes the deterministic compound growth path (where each pot grows
 * exactly at its expected return with 0 volatility).
 */
export function computeDeterministicPath(params: MonteCarloParams): number[] {
  const zeroVolParams: MonteCarloParams = {
    ...params,
    returnModel: 'normal',
    pots: params.pots.map(p => ({ ...p, returnStdDev: 0 })),
    inflationStdDev: 0,
    simulationCount: 10,
  };
  const res = runMonteCarloSimulation(zeroVolParams);
  return res.percentileBands.map(b => b.p50);
}
