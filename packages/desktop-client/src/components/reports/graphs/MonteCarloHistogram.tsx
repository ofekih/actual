import type { CSSProperties } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useRechartsAnimation } from '#components/reports/chart-theme';
import { Container } from '#components/reports/Container';
import { MonteCarloHistogramTooltip } from '#components/reports/graphs/MonteCarloHistogramTooltip';
import {
  computeTimelineTicks,
  formatShortYear,
} from '#components/reports/reports/monte-carlo/csp/useTimeAxis';

type MonteCarloHistogramProps = {
  style?: CSSProperties;
  depletionHistogram: Array<{ year: number; count: number }>;
  /** The user's current age; the x-axis shows the failure year's age */
  startAge: number;
  medianDepletionYear: number | null;
  simulationCount: number;
  showTooltip?: boolean;
  timeAxis?: 'age' | 'year';
};

export function MonteCarloHistogram({
  style,
  depletionHistogram,
  startAge,
  medianDepletionYear,
  simulationCount,
  showTooltip = true,
  timeAxis = 'age',
}: MonteCarloHistogramProps) {
  const animationProps = useRechartsAnimation({ animationDuration: 1000 });

  const data = depletionHistogram.map(entry => ({
    ...entry,
    // The age of the year that couldn't be funded, matching the drill-in
    age: startAge + entry.year - 1,
  }));

  const minVal = data.length > 0 ? data[0].age : startAge;
  const maxVal = data.length > 0 ? data[data.length - 1].age : startAge;
  const xAxisTicks = computeTimelineTicks(minVal, maxVal, 12);

  return (
    <Container style={style}>
      {(width, height) => (
        <BarChart
          width={width}
          height={height}
          data={data}
          margin={{ top: 15, right: 0, left: 20, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="age"
            ticks={xAxisTicks}
            interval={0}
            tick={{ fill: theme.pageText }}
            tickLine={{ stroke: theme.pageText }}
            tickFormatter={
              timeAxis === 'year'
                ? val => formatShortYear(Number(val))
                : undefined
            }
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: theme.pageText }}
            tickLine={{ stroke: theme.pageText }}
          />
          {showTooltip && (
            <Tooltip
              content={
                <MonteCarloHistogramTooltip
                  simulationCount={simulationCount}
                  timeAxis={timeAxis}
                />
              }
              isAnimationActive={false}
              cursor={{ fill: 'transparent' }}
            />
          )}
          {medianDepletionYear != null && (
            <ReferenceLine
              x={startAge + medianDepletionYear - 1}
              stroke={theme.noticeText}
              strokeDasharray="4 4"
            />
          )}
          <Bar
            dataKey="count"
            fill={theme.reportsNumberNegative}
            {...animationProps}
          />
        </BarChart>
      )}
    </Container>
  );
}
