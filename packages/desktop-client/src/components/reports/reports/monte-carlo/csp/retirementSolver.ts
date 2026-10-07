import {
  getMonteCarloHorizonYears,
  runMonteCarloSimulation,
} from '#components/reports/reports/monte-carlo/monteCarloSimulation';
import type { MonteCarloConfig } from '#components/reports/reports/monte-carlo/monteCarloSimulation';

export type RetirementFeasibilityPoint = {
  yearOrAge: number;
  successRate: number;
};

export type RetirementSolverResult = {
  earliestYearOrAge: number | null;
  successRateAtEarliest: number | null;
  targetSuccessRate: number;
  points: RetirementFeasibilityPoint[];
};

/**
 * Searches for the earliest retirement year (or age) that achieves at least targetSuccessRate.
 * Tests candidate years from currentAge + 1 up to targetAge - 1.
 */
export function solveEarliestRetirement({
  baseConfig,
  targetSuccessRate = 0.85,
  simCount = 1000,
}: {
  baseConfig: MonteCarloConfig;
  targetSuccessRate?: number;
  simCount?: number;
}): RetirementSolverResult {
  const minYear = baseConfig.currentAge + 1;
  const maxYear = baseConfig.targetAge - 1;

  if (minYear >= maxYear) {
    return {
      earliestYearOrAge: null,
      successRateAtEarliest: null,
      targetSuccessRate,
      points: [],
    };
  }

  // Generate candidate years (step by 1 if span <= 30, otherwise step by 2)
  const span = maxYear - minYear;
  const step = span > 30 ? 2 : 1;
  const candidateYears: number[] = [];
  for (let y = minYear; y <= maxYear; y += step) {
    candidateYears.push(y);
  }
  if (candidateYears[candidateYears.length - 1] !== maxYear) {
    candidateYears.push(maxYear);
  }

  const points: RetirementFeasibilityPoint[] = [];
  let earliestYearOrAge: number | null = null;
  let successRateAtEarliest: number | null = null;

  for (const candidate of candidateYears) {
    // Modify contributions and spending phases for candidate retirement year
    const updatedContributions = baseConfig.contributions.map(c => ({
      ...c,
      toAge: candidate,
    }));

    const hasAccumulationPhase = baseConfig.spendingPhases.some(
      p => p.annualWithdrawal === 0,
    );

    let updatedSpendingPhases: MonteCarloConfig['spendingPhases'];
    if (hasAccumulationPhase) {
      updatedSpendingPhases = baseConfig.spendingPhases.map(phase => {
        if (phase.annualWithdrawal === 0) {
          return phase;
        }
        return {
          ...phase,
          fromAge: candidate,
        };
      });
    } else {
      // Prepend an accumulation phase so spending before candidate year is 0
      const accumulationPhase = {
        id: 'solver-accumulation-phase',
        name: 'Accumulation',
        fromAge: null,
        annualWithdrawal: 0,
      };
      const retirementPhases = baseConfig.spendingPhases.map(phase => ({
        ...phase,
        fromAge: candidate,
      }));
      updatedSpendingPhases = [accumulationPhase, ...retirementPhases];
    }

    const testConfig: MonteCarloConfig = {
      ...baseConfig,
      contributions: updatedContributions,
      spendingPhases: updatedSpendingPhases,
      simulationCount: simCount,
    };

    const horizonYears = getMonteCarloHorizonYears(testConfig);
    const simulationResult = runMonteCarloSimulation({
      ...testConfig,
      horizonYears,
      deflateToTodaysMoney: true,
    });

    // Calculate success rate
    let depletedCount = 0;
    for (let i = 0; i < simulationResult.simulationCount; i++) {
      if (simulationResult.depletionYearBySimulation[i] >= 0) {
        depletedCount++;
      }
    }
    const successRate =
      (simulationResult.simulationCount - depletedCount) /
      simulationResult.simulationCount;

    points.push({
      yearOrAge: candidate,
      successRate,
    });

    if (earliestYearOrAge == null && successRate >= targetSuccessRate) {
      earliestYearOrAge = candidate;
      successRateAtEarliest = successRate;
    }
  }

  return {
    earliestYearOrAge,
    successRateAtEarliest,
    targetSuccessRate,
    points,
  };
}
