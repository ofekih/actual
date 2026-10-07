import { Trans, useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';

import { FinancialText } from '#components/FinancialText';
import { formatTimepointWithAges } from '#components/reports/reports/monte-carlo/csp/useTimeAxis';
import { useFormat } from '#hooks/useFormat';

export type MonteCarloGraphView =
  | 'all'
  | 'single-worst'
  | 'worst-case'
  | 'pessimistic'
  | 'median'
  | 'optimistic';

export type FanChartDataPoint = {
  year: number;
  age: number;
  band80?: [number, number];
  band50?: [number, number];
  p5?: number;
  p10?: number;
  p25?: number;
  p30?: number;
  p50?: number;
  p70?: number;
  p75?: number;
  p90?: number;
  worstRun?: number;
  historicalBalance?: number;
  deterministic?: number;
};

// Single source of truth for which data point each focused view plots -
// the graph draws this key and the tooltip reads the same one
export const VIEW_DATA_KEYS = {
  'single-worst': 'worstRun',
  'worst-case': 'p5',
  pessimistic: 'p30',
  median: 'p50',
  optimistic: 'p70',
} as const satisfies Record<
  Exclude<MonteCarloGraphView, 'all'>,
  keyof FanChartDataPoint
>;

type PayloadItem = {
  payload: FanChartDataPoint;
};

type MonteCarloGraphTooltipProps = {
  active?: boolean;
  payload?: PayloadItem[];
  view?: MonteCarloGraphView;
  timeAxis?: 'age' | 'year';
  userBirthYear?: number | null;
  spouseBirthYear?: number | null;
  spouseName?: string | null;
  showDeterministic?: boolean;
};

export function MonteCarloGraphTooltip({
  active,
  payload,
  view = 'all',
  timeAxis = 'age',
  userBirthYear,
  spouseBirthYear,
  spouseName,
  showDeterministic = false,
}: MonteCarloGraphTooltipProps) {
  const { t } = useTranslation();
  const format = useFormat();

  if (active && payload && payload.length) {
    const point = payload[0].payload;

    if (point.year < 0 && point.historicalBalance != null) {
      return (
        <div
          className={css({
            zIndex: 1000,
            pointerEvents: 'none',
            borderRadius: 2,
            boxShadow: '0 1px 6px rgba(0, 0, 0, .20)',
            backgroundColor: theme.menuBackground,
            color: theme.menuItemText,
            padding: 10,
          })}
        >
          <div style={{ marginBottom: 6 }}>
            <strong>
              {timeAxis === 'year'
                ? formatTimepointWithAges(
                    point.age,
                    userBirthYear,
                    spouseBirthYear,
                    spouseName,
                  )
                : t('Past (age {{age}})', { age: point.age })}
            </strong>
          </div>
          <View
            className={css({
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: 20,
            })}
          >
            <div>
              <Trans>Historical balance:</Trans>
            </div>
            <div>
              <FinancialText>
                {format(point.historicalBalance, 'financial')}
              </FinancialText>
            </div>
          </View>
        </div>
      );
    }

    const singleViewLabels: Record<
      Exclude<MonteCarloGraphView, 'all'>,
      string
    > = {
      'single-worst': t('Single worst run:'),
      'worst-case': t('Worst-case (5th percentile):'),
      pessimistic: t('Pessimistic (30th percentile):'),
      median: t('Median (50th percentile):'),
      optimistic: t('Optimistic (70th percentile):'),
    };
    const rows =
      view === 'all'
        ? [
            ...(point.p90 != null
              ? [{ label: t('Best 10%:'), value: point.p90 }]
              : []),
            ...(point.p75 != null
              ? [{ label: t('Top quartile:'), value: point.p75 }]
              : []),
            ...(point.p50 != null
              ? [{ label: t('Median:'), value: point.p50 }]
              : []),
            ...(point.p25 != null
              ? [{ label: t('Bottom quartile:'), value: point.p25 }]
              : []),
            ...(point.p10 != null
              ? [{ label: t('Worst 10%:'), value: point.p10 }]
              : []),
          ]
        : [
            {
              label: singleViewLabels[view],
              value: point[VIEW_DATA_KEYS[view]] ?? 0,
            },
          ];

    if (showDeterministic && point.deterministic != null) {
      rows.push({
        label: t('Average return:'),
        value: point.deterministic,
      });
    }

    const headerText =
      point.year === 0
        ? timeAxis === 'year'
          ? `${t('Today')} (${formatTimepointWithAges(point.age, userBirthYear, spouseBirthYear, spouseName)})`
          : t('Start (age {{age}})', { age: point.age })
        : timeAxis === 'year'
          ? formatTimepointWithAges(
              point.age,
              userBirthYear,
              spouseBirthYear,
              spouseName,
            )
          : t('Age {{age}}', { age: point.age });

    return (
      <div
        className={css({
          zIndex: 1000,
          pointerEvents: 'none',
          borderRadius: 2,
          boxShadow: '0 1px 6px rgba(0, 0, 0, .20)',
          backgroundColor: theme.menuBackground,
          color: theme.menuItemText,
          padding: 10,
        })}
      >
        <div style={{ marginBottom: 10 }}>
          <strong>{headerText}</strong>
        </div>
        <div style={{ lineHeight: 1.5 }}>
          {rows.map(row => (
            <View
              key={row.label}
              className={css({
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: 20,
              })}
            >
              <div>{row.label}</div>
              <div>
                <FinancialText>{format(row.value, 'financial')}</FinancialText>
              </div>
            </View>
          ))}
        </div>
      </div>
    );
  }
  return null;
}
