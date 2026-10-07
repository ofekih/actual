import { describe, expect, it } from 'vitest';

import {
  createMonteCarloPot,
  createMonteCarloSpendingPhase,
  MONTE_CARLO_DEFAULTS,
} from '#components/reports/reports/monte-carlo/monteCarloSimulation';
import type { MonteCarloConfig } from '#components/reports/reports/monte-carlo/monteCarloSimulation';

import { solveEarliestRetirement } from './retirementSolver';

describe('retirementSolver', () => {
  it('solves earliest retirement year or age', () => {
    const pot = createMonteCarloPot('pot-1');
    pot.startingBalance = 2000000; // Well-funded starting portfolio
    pot.expectedReturnMean = 0.07;
    pot.returnStdDev = 0.12;

    const phase = createMonteCarloSpendingPhase('spending-1');
    phase.annualWithdrawal = 40000;

    const config: MonteCarloConfig = {
      ...MONTE_CARLO_DEFAULTS,
      currentAge: 30,
      targetAge: 60,
      pots: [pot],
      spendingPhases: [phase],
      contributions: [],
    };

    const result = solveEarliestRetirement({
      baseConfig: config,
      targetSuccessRate: 0.85,
      simCount: 100, // fast test run
    });

    expect(result.points.length).toBeGreaterThan(0);
    // With $2M and $40k/yr withdrawal (2% safe withdrawal rate), it should be successful early
    expect(result.earliestYearOrAge).not.toBeNull();
    expect(result.successRateAtEarliest).toBeGreaterThanOrEqual(0.85);
  });

  it('handles invalid spans gracefully', () => {
    const config: MonteCarloConfig = {
      ...MONTE_CARLO_DEFAULTS,
      currentAge: 50,
      targetAge: 51,
    };

    const result = solveEarliestRetirement({
      baseConfig: config,
      targetSuccessRate: 0.85,
    });

    expect(result.earliestYearOrAge).toBeNull();
    expect(result.points).toEqual([]);
  });

  it('demonstrates increasing success rates as retirement year is deferred', () => {
    const pot = createMonteCarloPot('pot-1');
    pot.startingBalance = 100000; // Small initial nest egg
    pot.expectedReturnMean = 0.08;
    pot.returnStdDev = 0.12;

    const phase = createMonteCarloSpendingPhase('spending-1');
    phase.annualWithdrawal = 50000; // Significant spending

    // User is saving $30k/yr
    const contribution = {
      id: 'c-1',
      name: '401k',
      potId: pot.id,
      fromAge: null,
      toAge: 65,
      annualAmount: 30000,
      adjustsWithInflation: true,
      sourceIncomeStreamId: null,
      beforeTax: false,
    };

    const config: MonteCarloConfig = {
      ...MONTE_CARLO_DEFAULTS,
      currentAge: 25,
      targetAge: 60,
      pots: [pot],
      spendingPhases: [phase],
      contributions: [contribution],
    };

    const result = solveEarliestRetirement({
      baseConfig: config,
      targetSuccessRate: 0.85,
      simCount: 200,
    });

    expect(result.points.length).toBeGreaterThan(5);
    const firstPoint = result.points[0];
    const lastPoint = result.points[result.points.length - 1];

    // Retiring immediately at age 26 on $100k with $50k/yr withdrawals fails quickly
    // Retiring at age 59 after 34 years of saving $30k/yr succeeds with high probability
    expect(lastPoint.successRate).toBeGreaterThan(firstPoint.successRate);
  });
});
