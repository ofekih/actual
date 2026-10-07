import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import type { MonteCarloConfig } from '#components/reports/reports/monte-carlo/monteCarloSimulation';

import { solveEarliestRetirement } from './retirementSolver';
import { formatTimepointWithAges, isYearMode } from './useTimeAxis';

type RetirementSolverModalProps = {
  isOpen: boolean;
  onClose: () => void;
  config: MonteCarloConfig;
  onApplyRetirementYear: (yearOrAge: number) => void;
  userBirthYear?: number | null;
  spouseBirthYear?: number | null;
  spouseName?: string | null;
};

export function RetirementSolverModal({
  isOpen,
  onClose,
  config,
  onApplyRetirementYear,
  userBirthYear,
  spouseBirthYear,
  spouseName = 'Nicole',
}: RetirementSolverModalProps) {
  const { t } = useTranslation();
  const [targetRate, setTargetRate] = useState(0.85);

  const yearMode = isYearMode(config.timeAxis);

  const solution = useMemo(() => {
    if (!isOpen) return null;
    return solveEarliestRetirement({
      baseConfig: config,
      targetSuccessRate: targetRate,
      simCount: 1000,
    });
  }, [isOpen, config, targetRate]);

  if (!isOpen) return null;

  const earliest = solution?.earliestYearOrAge;
  const successPct =
    solution?.successRateAtEarliest != null
      ? Math.round(solution.successRateAtEarliest * 100)
      : null;

  const yearsFromNow =
    earliest != null ? Math.max(0, earliest - config.currentAge) : null;

  return (
    <Modal name="retirement-solver-modal" isDismissable onClose={onClose}>
      <ModalHeader
        title={t('When can we retire?')}
        rightContent={<ModalCloseButton onPress={onClose} />}
      />
      <View
        style={{
          padding: 20,
          gap: 20,
          maxWidth: 580,
          maxHeight: '75vh',
          overflowY: 'auto',
          color: theme.pageText,
        }}
      >
        <Text style={{ color: theme.pageTextSubdued }}>
          <Trans>
            This solver simulates your plan across candidate retirement years to
            find the earliest year where your investments have at least your
            chosen target success rate.
          </Trans>
        </Text>

        {/* Target Success Rate picker */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 15,
            padding: 12,
            backgroundColor: theme.tableBackground,
            borderRadius: 6,
          }}
        >
          <Text style={{ fontWeight: 600 }}>
            <Trans>Target confidence:</Trans>
          </Text>
          <Select
            value={String(targetRate)}
            onChange={val => setTargetRate(Number(val))}
            options={[
              ['0.75', t('75% (Flexible)')],
              ['0.80', t('80% (Moderate)')],
              ['0.85', t('85% (Recommended)')],
              ['0.90', t('90% (Conservative)')],
              ['0.95', t('95% (High certainty)')],
            ]}
          />
        </View>

        {/* Solver Result Card */}
        {earliest != null ? (
          <View
            style={{
              padding: 20,
              backgroundColor: theme.noticeBackgroundLight,
              border: `1px solid ${theme.noticeBorder}`,
              borderRadius: 8,
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 14, color: theme.noticeText }}>
              <Trans>Earliest feasible retirement:</Trans>
            </Text>
            <Text
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: theme.noticeText,
              }}
            >
              {yearMode
                ? formatTimepointWithAges(
                    earliest,
                    userBirthYear ?? config.userBirthYear,
                    spouseBirthYear ?? config.spouseBirthYear,
                    spouseName,
                  )
                : t('Age {{age}}', { age: earliest })}
            </Text>
            <Text style={{ fontSize: 14, color: theme.pageText }}>
              <Trans values={{ successPct, yearsFromNow }}>
                Success rate: <strong>{'{{successPct}}'}%</strong> (in{' '}
                <strong>{'{{yearsFromNow}}'} years</strong>)
              </Trans>
            </Text>

            {yearMode &&
              (userBirthYear ||
                spouseBirthYear ||
                config.userBirthYear ||
                config.spouseBirthYear) && (
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 15,
                    marginTop: 5,
                    fontSize: 13,
                    color: theme.pageTextSubdued,
                  }}
                >
                  {(userBirthYear ?? config.userBirthYear) && (
                    <Text>
                      <Trans
                        values={{
                          age:
                            earliest - (userBirthYear ?? config.userBirthYear!),
                        }}
                      >
                        Your age: <strong>{'{{age}}'}</strong>
                      </Trans>
                    </Text>
                  )}
                  {(spouseBirthYear ?? config.spouseBirthYear) && (
                    <Text>
                      <Trans
                        values={{
                          partnerName: spouseName || 'Nicole',
                          age:
                            earliest -
                            (spouseBirthYear ?? config.spouseBirthYear!),
                        }}
                      >
                        {"{{partnerName}}'s age:"} <strong>{'{{age}}'}</strong>
                      </Trans>
                    </Text>
                  )}
                </View>
              )}
          </View>
        ) : (
          <View
            style={{
              padding: 15,
              backgroundColor: theme.warningBackground,
              border: `1px solid ${theme.warningBorder}`,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: theme.warningText }}>
              <Trans values={{ rate: Math.round(targetRate * 100) }}>
                No year reached an {'{{rate}}'}% success rate within the current
                horizon. Consider increasing contributions, lowering retirement
                spending, or adjusting your asset allocation.
              </Trans>
            </Text>
          </View>
        )}

        {/* Breakdown table */}
        {solution && solution.points.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontWeight: 600, fontSize: 13 }}>
              <Trans>Feasibility by year:</Trans>
            </Text>
            <View
              style={{
                maxHeight: 220,
                overflowY: 'auto',
                border: `1px solid ${theme.tableBorder}`,
                borderRadius: 4,
              }}
            >
              {solution.points.map(pt => {
                const isSelected = pt.yearOrAge === earliest;
                const meetsTarget = pt.successRate >= targetRate;
                return (
                  <View
                    key={pt.yearOrAge}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      minHeight: 32,
                      flexShrink: 0,
                      padding: '6px 12px',
                      backgroundColor: isSelected
                        ? theme.tableRowBackgroundHover
                        : 'transparent',
                      borderBottom: `1px solid ${theme.tableBorder}`,
                      fontSize: 13,
                    }}
                  >
                    <Text style={{ fontWeight: isSelected ? 600 : 400 }}>
                      {yearMode
                        ? formatTimepointWithAges(
                            pt.yearOrAge,
                            userBirthYear ?? config.userBirthYear,
                            spouseBirthYear ?? config.spouseBirthYear,
                            spouseName,
                          )
                        : t('Age {{age}}', { age: pt.yearOrAge })}
                    </Text>
                    <Text
                      style={{
                        fontWeight: 600,
                        color: meetsTarget
                          ? theme.reportsNumberPositive
                          : theme.reportsNumberNegative,
                      }}
                    >
                      {Math.round(pt.successRate * 100)}%
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Footer actions */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 12,
            marginTop: 15,
            paddingTop: 15,
            borderTop: `1px solid ${theme.tableBorder}`,
            flexShrink: 0,
          }}
        >
          <Button
            style={{
              padding: '8px 18px',
              minHeight: 36,
              fontSize: 14,
              fontWeight: 500,
            }}
            onPress={onClose}
          >
            <Trans>Close</Trans>
          </Button>
          {earliest != null && (
            <Button
              variant="primary"
              style={{
                padding: '8px 22px',
                minHeight: 36,
                fontSize: 14,
                fontWeight: 600,
              }}
              onPress={() => {
                onApplyRetirementYear(earliest);
                onClose();
              }}
            >
              <Trans values={{ earliest }}>
                Apply retirement year ({'{{earliest}}'}) to plan
              </Trans>
            </Button>
          )}
        </View>
      </View>
    </Modal>
  );
}
