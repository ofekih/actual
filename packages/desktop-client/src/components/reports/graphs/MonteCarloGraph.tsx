import { useTranslation } from 'react-i18next';

import type { CSSProperties } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useRechartsAnimation } from '#components/reports/chart-theme';
import { Container } from '#components/reports/Container';
import type {
  FanChartDataPoint,
  MonteCarloGraphView,
} from '#components/reports/graphs/MonteCarloGraphTooltip';
import {
  MonteCarloGraphTooltip,
  VIEW_DATA_KEYS,
} from '#components/reports/graphs/MonteCarloGraphTooltip';
import { computePadding } from '#components/reports/graphs/util/computePadding';
import { useMonteCarloTickFormatter } from '#components/reports/graphs/util/useMonteCarloTickFormatter';
import type { InvestmentHistoryPoint } from '#components/reports/reports/monte-carlo/csp/types';
import {
  computeTimelineTicks,
  formatShortYear,
  isYearMode,
} from '#components/reports/reports/monte-carlo/csp/useTimeAxis';
import type { MonteCarloPercentileBand } from '#components/reports/reports/monte-carlo/monteCarloSimulation';
import { useFormat } from '#hooks/useFormat';

type MonteCarloGraphProps = {
  style?: CSSProperties;
  percentileBands: MonteCarloPercentileBand[];
  /** The user's current age or year; the x-axis shows startAge + year */
  startAge: number;
  worstRunPath?: number[];
  view?: MonteCarloGraphView;
  compact?: boolean;
  showTooltip?: boolean;
  timeAxis?: 'age' | 'year';
  userBirthYear?: number | null;
  spouseBirthYear?: number | null;
  spouseName?: string | null;
  history?: InvestmentHistoryPoint[];
  deterministicPath?: number[];
  showDeterministic?: boolean;
};

export function MonteCarloGraph({
  style,
  percentileBands,
  startAge,
  worstRunPath,
  view = 'all',
  compact = false,
  showTooltip = true,
  timeAxis = 'age',
  userBirthYear,
  spouseBirthYear,
  spouseName,
  history,
  deterministicPath,
  showDeterministic = false,
}: MonteCarloGraphProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const tickFormatter = useMonteCarloTickFormatter();
  const animationProps = useRechartsAnimation({ animationDuration: 1000 });
  const yearMode = isYearMode(timeAxis);

  // Construct historical data points (year < 0)
  const historicalPoints: FanChartDataPoint[] = [];
  const currentCalendarYear = new Date().getFullYear();

  if (history && history.length > 0) {
    history
      .filter(pt => pt.year < (yearMode ? startAge : currentCalendarYear))
      .forEach(pt => {
        const offset = pt.year - (yearMode ? startAge : currentCalendarYear);
        historicalPoints.push({
          year: offset,
          age: yearMode ? pt.year : startAge + offset,
          historicalBalance: pt.balance,
        });
      });
  }

  // Projection points (year >= 0)
  const projectionPoints: FanChartDataPoint[] = percentileBands.map(band => ({
    year: band.year,
    age: startAge + band.year,
    band80: [band.p10, band.p90],
    band50: [band.p25, band.p75],
    p5: band.p5,
    p10: band.p10,
    p25: band.p25,
    p30: band.p30,
    p50: band.p50,
    p70: band.p70,
    p75: band.p75,
    p90: band.p90,
    worstRun: worstRunPath?.[band.year],
    deterministic: deterministicPath?.[band.year],
    // At year 0, connect the historical line to today's starting balance
    historicalBalance:
      band.year === 0 && historicalPoints.length > 0 ? band.p50 : undefined,
  }));

  const data: FanChartDataPoint[] = [...historicalPoints, ...projectionPoints];

  const minAge = data.length > 0 ? data[0].age : startAge;
  const maxAge =
    data.length > 0
      ? data[data.length - 1].age
      : startAge + percentileBands.length;
  const xAxisTicks = computeTimelineTicks(minAge, maxAge, compact ? 6 : 12);

  const xAxisTickFormatter = (val: unknown) => {
    const num = Number(val);
    if (isNaN(num)) return String(val);
    return yearMode ? formatShortYear(num) : String(num);
  };

  return (
    <Container
      style={{
        ...style,
        ...(compact && { height: 'auto' }),
      }}
    >
      {(width, height) => (
        <ComposedChart
          width={width}
          height={height}
          data={data}
          margin={{
            top: compact ? 0 : 15,
            right: 15,
            left: compact
              ? 0
              : computePadding(
                  data.map(point =>
                    Math.max(
                      point.p90 ?? 0,
                      point.historicalBalance ?? 0,
                      point.deterministic ?? 0,
                    ),
                  ),
                  value => format(value, 'financial-no-decimals'),
                ),
            bottom: compact ? 0 : 10,
          }}
        >
          {!compact && <CartesianGrid strokeDasharray="3 3" />}
          <XAxis
            dataKey="age"
            hide={compact}
            ticks={xAxisTicks}
            interval={0}
            tickFormatter={xAxisTickFormatter}
            tick={{ fill: theme.pageText }}
            tickLine={{ stroke: theme.pageText }}
          />
          <YAxis
            hide={compact}
            tickFormatter={tickFormatter}
            tick={{ fill: theme.pageText }}
            tickLine={{ stroke: theme.pageText }}
          />
          {showTooltip && (
            <Tooltip
              content={
                <MonteCarloGraphTooltip
                  view={view}
                  timeAxis={timeAxis}
                  userBirthYear={userBirthYear}
                  spouseBirthYear={spouseBirthYear}
                  spouseName={spouseName}
                  showDeterministic={showDeterministic}
                />
              }
              isAnimationActive={false}
            />
          )}

          {/* Reference line for Today / start point */}
          {historicalPoints.length > 0 && !compact && (
            <ReferenceLine
              x={startAge}
              stroke={theme.pageTextSubdued}
              strokeDasharray="3 3"
              label={{
                value: t('Today'),
                fill: theme.pageTextSubdued,
                position: 'top',
                fontSize: 12,
              }}
            />
          )}

          {/* Historical balances line */}
          {historicalPoints.length > 0 && (
            <Line
              type="monotone"
              dataKey="historicalBalance"
              name={t('Historical')}
              dot={{ r: 3, fill: theme.noticeText }}
              stroke={theme.noticeText}
              strokeWidth={2}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          {/* Optional deterministic expected return line */}
          {showDeterministic && (
            <Line
              type="monotone"
              dataKey="deterministic"
              name={t('Average return')}
              dot={false}
              stroke={theme.warningText}
              strokeDasharray="5 5"
              strokeWidth={2}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          {view === 'all' ? (
            <>
              <Area
                type="monotone"
                dataKey="band80"
                stroke="none"
                fill={theme.reportsChartFill}
                fillOpacity={0.15}
                {...animationProps}
              />
              <Area
                type="monotone"
                dataKey="band50"
                stroke="none"
                fill={theme.reportsChartFill}
                fillOpacity={0.3}
                {...animationProps}
              />
              <Line
                type="monotone"
                dataKey="p50"
                dot={false}
                stroke={theme.reportsChartFill}
                strokeWidth={2}
                {...animationProps}
              />
            </>
          ) : (
            <Area
              type="monotone"
              dataKey={VIEW_DATA_KEYS[view]}
              stroke={theme.reportsChartFill}
              strokeWidth={2}
              fill={theme.reportsChartFill}
              fillOpacity={0.08}
              {...animationProps}
            />
          )}
        </ComposedChart>
      )}
    </Container>
  );
}
