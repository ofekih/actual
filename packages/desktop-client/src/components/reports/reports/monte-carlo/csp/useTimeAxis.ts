import type { TimeAxis } from './types';

export function getCurrentYear(): number {
  return new Date().getFullYear();
}

export function isYearMode(timeAxis?: TimeAxis | null): boolean {
  return timeAxis === 'year';
}

export function formatShortYear(val: number): string {
  if (val >= 1900 && val <= 2199) {
    return `'${String(val).slice(-2)}`;
  }
  return String(val);
}

export function formatTimepoint(
  val: number,
  timeAxis: TimeAxis = 'age',
  short = false,
): string {
  if (timeAxis === 'year') {
    return short ? formatShortYear(val) : String(val);
  }
  return String(val);
}

export function formatTimepointWithAges(
  year: number,
  userBirthYear?: number | null,
  spouseBirthYear?: number | null,
  spouseName?: string | null,
): string {
  const hints: string[] = [];
  if (userBirthYear != null && userBirthYear > 1900) {
    const age = year - userBirthYear;
    if (age >= 0 && age <= 130) {
      hints.push(`You: ${age}`);
    }
  }
  if (spouseBirthYear != null && spouseBirthYear > 1900) {
    const age = year - spouseBirthYear;
    if (age >= 0 && age <= 130) {
      hints.push(`${spouseName || 'Nicole'}: ${age}`);
    }
  }

  if (hints.length > 0) {
    return `${year} (${hints.join(' · ')})`;
  }
  return String(year);
}

export function getTimepointLabel(
  timeAxis: TimeAxis = 'age',
  t: (key: string) => string,
): string {
  return timeAxis === 'year' ? t('Year') : t('Age');
}

export function getFromTimepointLabel(
  timeAxis: TimeAxis = 'age',
  t: (key: string) => string,
): string {
  return timeAxis === 'year' ? t('From year') : t('From age');
}

export function getToTimepointLabel(
  timeAxis: TimeAxis = 'age',
  t: (key: string) => string,
): string {
  return timeAxis === 'year' ? t('To year') : t('To age');
}

export function getAccessibleTimepointLabel(
  timeAxis: TimeAxis = 'age',
  t: (key: string) => string,
): string {
  return timeAxis === 'year'
    ? t('Accessible from year')
    : t('Accessible from age');
}

export function convertTimelineMode(
  currentAge: number,
  targetAge: number,
  newMode: TimeAxis,
): { currentAge: number; targetAge: number } {
  const horizon = Math.max(5, targetAge - currentAge);
  const currentYear = getCurrentYear();

  if (newMode === 'year') {
    const resolvedCurrentYear =
      currentAge >= 1900 && currentAge <= 2199 ? currentAge : currentYear;
    return {
      currentAge: resolvedCurrentYear,
      targetAge: resolvedCurrentYear + (horizon <= 100 ? horizon : 30),
    };
  } else {
    const resolvedCurrentAge =
      currentAge < 1900 && currentAge > 0 ? currentAge : 40;
    return {
      currentAge: resolvedCurrentAge,
      targetAge: resolvedCurrentAge + (horizon <= 100 ? horizon : 30),
    };
  }
}

/**
 * Computes clean, predictable, evenly spaced tick values for timeline and histogram axes.
 * Avoids Recharts' greedy character-width collision detection which produces erratic alternating ticks.
 */
export function computeTimelineTicks(
  minVal: number,
  maxVal: number,
  targetTickCount = 12,
): number[] {
  const range = maxVal - minVal;
  if (range <= 0) return [minVal];

  const rawStep = range / targetTickCount;
  let step = 1;
  if (rawStep > 8) step = 10;
  else if (rawStep > 2.5) step = 5;
  else if (rawStep > 1.2) step = 2;
  else step = 1;

  const ticks: number[] = [];
  const firstMultiple = Math.ceil(minVal / step) * step;

  // Include minVal if it is far enough from the first multiple to avoid collision
  if (
    firstMultiple > minVal &&
    firstMultiple - minVal >= Math.max(2, step * 0.6)
  ) {
    ticks.push(minVal);
  }

  for (let val = firstMultiple; val <= maxVal; val += step) {
    ticks.push(val);
  }

  // Include maxVal if it is far enough from the last multiple
  const lastTick = ticks[ticks.length - 1];
  if (lastTick !== undefined && maxVal - lastTick >= Math.max(2, step * 0.6)) {
    ticks.push(maxVal);
  }

  return ticks;
}
