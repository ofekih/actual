import { useState } from 'react';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { FinancialText } from '#components/FinancialText';
import { LabeledCheckbox } from '#components/forms/LabeledCheckbox';
import type { MonteCarloConfig } from '#components/reports/reports/monte-carlo/monteCarloSimulation';
import { useFormat } from '#hooks/useFormat';

import { CspSetupModal } from './CspSetupModal';
import { RetirementSolverModal } from './RetirementSolverModal';
import type { useCspInvestmentData } from './useCspInvestmentData';
import { formatTimepointWithAges, isYearMode } from './useTimeAxis';

type CspMonteCarloToolbarProps = {
  config: MonteCarloConfig;
  onConfigChange: (changes: Partial<MonteCarloConfig>) => void;
  cspData: ReturnType<typeof useCspInvestmentData>;
  showDeterministic: boolean;
  onToggleDeterministic: (show: boolean) => void;
};

export function CspMonteCarloToolbar({
  config,
  onConfigChange,
  cspData,
  showDeterministic,
  onToggleDeterministic,
}: CspMonteCarloToolbarProps) {
  const format = useFormat();

  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [isSolverModalOpen, setIsSolverModalOpen] = useState(false);

  const yearMode = isYearMode(config.timeAxis);

  const totalInvestmentBalance = cspData.investmentAccounts.reduce(
    (sum, a) => sum + (a.balance ?? 0),
    0,
  );

  // Check how many CSP investment accounts are currently linked in pots
  const linkedAccountIds = new Set(
    config.pots.map(p => p.accountId).filter((id): id is string => id != null),
  );
  const unlinkedAccountsCount = cspData.investmentAccounts.filter(
    a => !linkedAccountIds.has(a.id),
  ).length;

  function handleApplyRetirementYear(yearOrAge: number) {
    // Update contributions' toAge and spending phases' fromAge
    const updatedContributions = config.contributions.map(c => ({
      ...c,
      toAge: yearOrAge,
    }));
    const updatedSpendingPhases = config.spendingPhases.map(phase => {
      if (phase.annualWithdrawal === 0) {
        return phase;
      }
      return {
        ...phase,
        fromAge: yearOrAge,
      };
    });

    onConfigChange({
      retirementYear: yearOrAge,
      contributions: updatedContributions,
      spendingPhases: updatedSpendingPhases,
    });
  }

  return (
    <>
      <View
        style={{
          flexShrink: 0,
          minHeight: 48,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          backgroundColor: theme.tableBackground,
          borderRadius: 6,
          border: `1px solid ${theme.tableBorder}`,
          gap: 12,
          marginBottom: 12,
        }}
      >
        {/* Left summary details */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            fontSize: 13,
          }}
        >
          <View
            style={{
              padding: '3px 8px',
              backgroundColor: theme.pillBackground,
              borderRadius: 4,
              fontWeight: 600,
              color: theme.pillText,
            }}
          >
            {yearMode ? (
              <Trans>Year timeline</Trans>
            ) : (
              <Trans>Conscious Spending Plan</Trans>
            )}
          </View>

          <Text style={{ color: theme.pageText }}>
            <Trans>
              Investments:{' '}
              <strong>
                <FinancialText as="span">
                  {format(totalInvestmentBalance, 'financial')}
                </FinancialText>
              </strong>{' '}
              ({{ count: cspData.investmentAccounts.length }} accounts)
            </Trans>
          </Text>

          {unlinkedAccountsCount > 0 && (
            <View
              style={{
                padding: '2px 6px',
                backgroundColor: theme.warningBackground,
                color: theme.warningText,
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              <Trans>{{ count: unlinkedAccountsCount }} unlinked in plan</Trans>
            </View>
          )}

          {config.retirementYear != null && (
            <Text style={{ color: theme.pageTextSubdued }}>
              <Trans>
                Retire:{' '}
                <strong>
                  {yearMode
                    ? formatTimepointWithAges(
                        config.retirementYear,
                        config.userBirthYear ?? cspData.userBirthYear,
                        config.spouseBirthYear ?? cspData.spouseBirthYear,
                        cspData.spouseName,
                      )
                    : config.retirementYear}
                </strong>
              </Trans>
            </Text>
          )}
        </View>

        {/* Right action buttons */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <LabeledCheckbox
            checked={showDeterministic}
            onChange={() => onToggleDeterministic(!showDeterministic)}
            id="deterministic-overlay-toggle"
          >
            <Text style={{ fontSize: 13 }}>
              <Trans>Average return line</Trans>
            </Text>
          </LabeledCheckbox>

          <Button onPress={() => setIsSolverModalOpen(true)}>
            <Trans>When can we retire?</Trans>
          </Button>

          <Button variant="primary" onPress={() => setIsSetupModalOpen(true)}>
            <Trans>Sync from CSP</Trans>
          </Button>
        </View>
      </View>

      <CspSetupModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
        config={config}
        onApply={onConfigChange}
        cspData={cspData}
      />

      <RetirementSolverModal
        isOpen={isSolverModalOpen}
        onClose={() => setIsSolverModalOpen(false)}
        config={config}
        onApplyRetirementYear={handleApplyRetirementYear}
        userBirthYear={cspData.userBirthYear}
        spouseBirthYear={cspData.spouseBirthYear}
        spouseName={cspData.spouseName}
      />
    </>
  );
}
