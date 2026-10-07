import { describe, expect, it } from 'vitest';

import {
  computeTimelineTicks,
  convertTimelineMode,
  formatShortYear,
  formatTimepoint,
  formatTimepointWithAges,
  getAccessibleTimepointLabel,
  getCurrentYear,
  getFromTimepointLabel,
  getTimepointLabel,
  getToTimepointLabel,
  isYearMode,
} from './useTimeAxis';

describe('useTimeAxis', () => {
  it('returns current year', () => {
    const year = getCurrentYear();
    expect(year).toBeGreaterThanOrEqual(2024);
    expect(year).toBeLessThan(2100);
  });

  it('checks year mode correctly', () => {
    expect(isYearMode('year')).toBe(true);
    expect(isYearMode('age')).toBe(false);
    expect(isYearMode(undefined)).toBe(false);
    expect(isYearMode(null)).toBe(false);
  });

  it('formats short years correctly', () => {
    expect(formatShortYear(2026)).toBe("'26");
    expect(formatShortYear(2035)).toBe("'35");
    expect(formatShortYear(1999)).toBe("'99");
    expect(formatShortYear(2100)).toBe("'00");
    expect(formatShortYear(65)).toBe('65');
  });

  it('formats timepoint depending on mode', () => {
    expect(formatTimepoint(2026, 'year', true)).toBe("'26");
    expect(formatTimepoint(2026, 'year', false)).toBe('2026');
    expect(formatTimepoint(65, 'age', true)).toBe('65');
    expect(formatTimepoint(65, 'age', false)).toBe('65');
  });

  it('formats timepoint with ages for user and spouse', () => {
    expect(formatTimepointWithAges(2030, 1990, 1992)).toBe(
      '2030 (You: 40 · Nicole: 38)',
    );
    expect(formatTimepointWithAges(2030, 1990, 1992, 'Spouse')).toBe(
      '2030 (You: 40 · Spouse: 38)',
    );
    expect(formatTimepointWithAges(2030, 1990, null)).toBe('2030 (You: 40)');
    expect(formatTimepointWithAges(2030, null, 1992)).toBe('2030 (Nicole: 38)');
    expect(formatTimepointWithAges(2030, null, null)).toBe('2030');
    // Ignores unreasonable birth years
    expect(formatTimepointWithAges(2030, 1850, null)).toBe('2030');
  });

  it('returns correct labels for timeline modes', () => {
    const t = (k: string) => k;
    expect(getTimepointLabel('year', t)).toBe('Year');
    expect(getTimepointLabel('age', t)).toBe('Age');
    expect(getFromTimepointLabel('year', t)).toBe('From year');
    expect(getFromTimepointLabel('age', t)).toBe('From age');
    expect(getToTimepointLabel('year', t)).toBe('To year');
    expect(getToTimepointLabel('age', t)).toBe('To age');
    expect(getAccessibleTimepointLabel('year', t)).toBe('Accessible from year');
    expect(getAccessibleTimepointLabel('age', t)).toBe('Accessible from age');
  });

  it('converts timeline mode between age and year preserving horizon', () => {
    const toYear = convertTimelineMode(30, 60, 'year');
    const currentYear = getCurrentYear();
    expect(toYear.currentAge).toBe(currentYear);
    expect(toYear.targetAge).toBe(currentYear + 30);

    const toAge = convertTimelineMode(2026, 2056, 'age');
    expect(toAge.currentAge).toBe(40);
    expect(toAge.targetAge).toBe(40 + 30);
  });

  it('computes clean, predictable timeline ticks', () => {
    // 30-year span (e.g. 2026 to 2056)
    const yearTicks = computeTimelineTicks(2026, 2056, 10);
    expect(yearTicks).toEqual([2026, 2030, 2035, 2040, 2045, 2050, 2055]);

    // Long age span (e.g. 26 to 100)
    const ageTicks = computeTimelineTicks(26, 100, 14);
    expect(ageTicks).toEqual([
      26, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
    ]);

    // Short horizon (e.g. 10 years)
    const shortTicks = computeTimelineTicks(60, 70, 10);
    expect(shortTicks).toEqual([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70]);
  });
});
