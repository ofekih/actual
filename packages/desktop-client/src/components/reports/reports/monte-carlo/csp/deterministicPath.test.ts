import { describe, expect, it } from 'vitest';

import {
  createMonteCarloPot,
  MONTE_CARLO_DEFAULTS,
} from '#components/reports/reports/monte-carlo/monteCarloSimulation';
import type { MonteCarloParams } from '#components/reports/reports/monte-carlo/monteCarloSimulation';

import { computeDeterministicPath } from './deterministicPath';

describe('deterministicPath', () => {
  it('computes positive growing path for positive return pot with no withdrawals', () => {
    const pot = createMonteCarloPot('pot-1');
    pot.startingBalance = 10_000_000;
    pot.expectedReturnMean = 0.07;
    pot.returnStdDev = 0.15;

    const { targetAge: _targetAge, ...baseDefaults } = MONTE_CARLO_DEFAULTS;
    const params: MonteCarloParams = {
      ...baseDefaults,
      currentAge: 30,
      horizonYears: 10,
      pots: [pot],
      spendingPhases: [
        {
          id: 'phase-0',
          name: 'Zero withdrawal',
          fromAge: null,
          annualWithdrawal: 0,
        },
      ],
      contributions: [],
      deflateToTodaysMoney: false,
    };

    const path = computeDeterministicPath(params);
    expect(path.length).toBe(11); // Year 0 through 10
    expect(path[0]).toBe(10_000_000);
    // Each year must strictly grow with 7% return and 0 vol
    for (let i = 1; i < path.length; i++) {
      expect(path[i]).toBeGreaterThan(path[i - 1]);
    }
    // After 10 years at 7%, 100,000 * 1.07^10 ~ 196,715
    expect(path[10]).toBeGreaterThan(19_000_000);
    expect(path[10]).toBeLessThan(20_500_000);
  });
});
