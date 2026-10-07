import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { FinancialText } from '#components/FinancialText';
import { LabeledCheckbox } from '#components/forms/LabeledCheckbox';
import type { MonteCarloConfig } from '#components/reports/reports/monte-carlo/monteCarloSimulation';
import { useFormat } from '#hooks/useFormat';

import {
  createContributionsFromCsp,
  createPotsFromCspAccounts,
  createRetirementSpendingFromCsp,
} from './cspPotsAndContributions';
import type { useCspInvestmentData } from './useCspInvestmentData';
import { convertTimelineMode, getCurrentYear } from './useTimeAxis';

type CspSetupModalProps = {
  isOpen: boolean;
  onClose: () => void;
  config: MonteCarloConfig;
  onApply: (updatedConfig: MonteCarloConfig) => void;
  cspData: ReturnType<typeof useCspInvestmentData>;
};

export function CspSetupModal({
  isOpen,
  onClose,
  config,
  onApply,
  cspData,
}: CspSetupModalProps) {
  const { t } = useTranslation();
  const format = useFormat();

  const [importPots, setImportPots] = useState(true);
  const [importContributions, setImportContributions] = useState(true);
  const [contributionSource, setContributionSource] = useState<
    'planned' | 'actual'
  >('planned');
  const [importSpending, setImportSpending] = useState(true);
  const [spendingMultiplier, setSpendingMultiplier] = useState(1.0);
  const [enableYearMode, setEnableYearMode] = useState(true);

  if (!isOpen) return null;

  const totalInvestmentBalance = cspData.investmentAccounts.reduce(
    (sum, a) => sum + (a.balance ?? 0),
    0,
  );

  const plannedTotalAnnual = cspData.investmentCategories.reduce(
    (sum, c) => sum + (c.annualPlanned ?? 0),
    0,
  );

  const actualTotalAnnual = cspData.investmentCategories.reduce(
    (sum, c) => sum + (c.trailing12MonthActual ?? 0),
    0,
  );

  function handleApply() {
    let newConfig = { ...config };

    if (enableYearMode && newConfig.timeAxis !== 'year') {
      const converted = convertTimelineMode(
        newConfig.currentAge,
        newConfig.targetAge,
        'year',
      );
      newConfig = {
        ...newConfig,
        timeAxis: 'year',
        currentAge: converted.currentAge,
        targetAge: converted.targetAge,
      };
    }

    if (cspData.userBirthYear) {
      newConfig.userBirthYear = cspData.userBirthYear;
    }
    if (cspData.spouseBirthYear) {
      newConfig.spouseBirthYear = cspData.spouseBirthYear;
    }

    // Determine retirement year/age
    const retirementYearOrAge =
      newConfig.retirementYear ??
      (newConfig.timeAxis === 'year' ? getCurrentYear() + 25 : 65);
    newConfig.retirementYear = retirementYearOrAge;

    if (importPots && cspData.investmentAccounts.length > 0) {
      newConfig.pots = createPotsFromCspAccounts(
        cspData.investmentAccounts,
        newConfig.pots,
      );
    }

    if (importContributions && cspData.investmentCategories.length > 0) {
      newConfig.contributions = createContributionsFromCsp(
        cspData.investmentCategories,
        newConfig.pots,
        retirementYearOrAge,
        contributionSource === 'actual',
      );
    }

    if (importSpending && cspData.livingExpenses.totalAnnual > 0) {
      newConfig.spendingPhases = createRetirementSpendingFromCsp(
        cspData.livingExpenses,
        retirementYearOrAge,
        spendingMultiplier,
      );
    }

    onApply(newConfig);
    onClose();
  }

  return (
    <Modal name="csp-monte-carlo-setup" isDismissable onClose={onClose}>
      <ModalHeader
        title={t('Setup from Conscious Spending Plan')}
        rightContent={<ModalCloseButton onPress={onClose} />}
      />
      <View
        style={{
          padding: 20,
          gap: 20,
          maxWidth: 600,
          maxHeight: '75vh',
          overflowY: 'auto',
          color: theme.pageText,
        }}
      >
        <Text style={{ color: theme.pageTextSubdued }}>
          <Trans>
            Prefill your investment pots, contribution targets, and retirement
            spending directly from your Conscious Spending Plan.
          </Trans>
        </Text>

        {/* Section 1: Investment Accounts */}
        <View
          style={{
            flexShrink: 0,
            padding: 15,
            borderRadius: 6,
            border: `1px solid ${theme.tableBorder}`,
            gap: 10,
          }}
        >
          <LabeledCheckbox
            checked={importPots}
            onChange={() => setImportPots(!importPots)}
            id="import-pots-checkbox"
          >
            <Text style={{ fontWeight: 600 }}>
              <Trans>Import CSP investment accounts as live pots</Trans>
            </Text>
          </LabeledCheckbox>
          <View style={{ paddingLeft: 26, gap: 5 }}>
            <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
              {cspData.investmentAccounts.length > 0 ? (
                <>
                  <Trans>
                    Found {{ count: cspData.investmentAccounts.length }}{' '}
                    accounts (total:{' '}
                    <FinancialText as="span">
                      {format(totalInvestmentBalance, 'financial')}
                    </FinancialText>
                    ):
                  </Trans>{' '}
                  {cspData.investmentAccounts.map(a => a.name).join(', ')}
                  <Text
                    as="span"
                    style={{
                      display: 'block',
                      marginTop: 6,
                      color: theme.pageText,
                      fontSize: 12,
                    }}
                  >
                    <Trans>
                      Taxes automatically inferred: Roth &amp; HSA at 0%
                      (tax-free), Traditional 401(k) &amp; IRA at 15% (ordinary
                      income), Brokerage &amp; Equity at 10% (capital gains).
                    </Trans>
                  </Text>
                </>
              ) : (
                <Trans>
                  No accounts categorized as &quot;investments&quot; found in
                  CSP account types.
                </Trans>
              )}
            </Text>
          </View>
        </View>

        {/* Section 2: Contributions */}
        <View
          style={{
            flexShrink: 0,
            padding: 15,
            borderRadius: 6,
            border: `1px solid ${theme.tableBorder}`,
            gap: 10,
          }}
        >
          <LabeledCheckbox
            checked={importContributions}
            onChange={() => setImportContributions(!importContributions)}
            id="import-contrib-checkbox"
          >
            <Text style={{ fontWeight: 600 }}>
              <Trans>Import annual contributions from CSP Investments</Trans>
            </Text>
          </LabeledCheckbox>
          <View style={{ paddingLeft: 26, gap: 10 }}>
            <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
              {cspData.investmentCategories.length > 0 ? (
                <>
                  <Trans>
                    Found {{ count: cspData.investmentCategories.length }}{' '}
                    categories in CSP Investments group:
                  </Trans>{' '}
                  ({cspData.investmentCategories.map(c => c.name).join(', ')})
                </>
              ) : (
                <Trans>No CSP Investments categories found.</Trans>
              )}
            </Text>
            {importContributions && cspData.investmentCategories.length > 0 && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 15,
                  marginTop: 5,
                }}
              >
                <Text style={{ fontSize: 13 }}>
                  <Trans>Amount source:</Trans>
                </Text>
                <Select
                  value={contributionSource}
                  onChange={val =>
                    setContributionSource(val as 'planned' | 'actual')
                  }
                  options={[
                    [
                      'planned',
                      `${t('Planned target')} (${format(plannedTotalAnnual, 'financial')}/yr)`,
                    ],
                    [
                      'actual',
                      `${t('Trailing 12-mo actual')} (${format(actualTotalAnnual, 'financial')}/yr)`,
                    ],
                  ]}
                />
              </View>
            )}
          </View>
        </View>

        {/* Section 3: Retirement Spending */}
        <View
          style={{
            flexShrink: 0,
            padding: 15,
            borderRadius: 6,
            border: `1px solid ${theme.tableBorder}`,
            gap: 10,
          }}
        >
          <LabeledCheckbox
            checked={importSpending}
            onChange={() => setImportSpending(!importSpending)}
            id="import-spending-checkbox"
          >
            <Text style={{ fontWeight: 600 }}>
              <Trans>
                Set retirement spending from Fixed Costs + Guilt-Free
              </Trans>
            </Text>
          </LabeledCheckbox>
          <View style={{ paddingLeft: 26, gap: 10 }}>
            <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
              <Trans>
                Monthly living expenses:{' '}
                <FinancialText as="span">
                  {format(cspData.livingExpenses.totalMonthly, 'financial')}
                </FinancialText>{' '}
                (Fixed:{' '}
                <FinancialText as="span">
                  {format(
                    cspData.livingExpenses.fixedCostsMonthly,
                    'financial',
                  )}
                </FinancialText>
                , Guilt-Free:{' '}
                <FinancialText as="span">
                  {format(cspData.livingExpenses.guiltFreeMonthly, 'financial')}
                </FinancialText>
                ) &rarr; Annual:{' '}
                <FinancialText as="span">
                  {format(cspData.livingExpenses.totalAnnual, 'financial')}
                </FinancialText>
              </Trans>
            </Text>
            {importSpending && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 15,
                }}
              >
                <Text style={{ fontSize: 13 }}>
                  <Trans>Spending multiplier in retirement:</Trans>
                </Text>
                <Select
                  value={String(spendingMultiplier)}
                  onChange={val => setSpendingMultiplier(Number(val))}
                  style={{ minWidth: 260 }}
                  options={[
                    ['1', t('100% of current living expenses')],
                    ['0.85', t('85% (lower mortgage / work costs)')],
                    ['0.8', t('80% (standard retirement guideline)')],
                    ['0.75', t('75%')],
                  ]}
                />
              </View>
            )}
          </View>
        </View>

        {/* Section 4: Timeline Mode */}
        <View
          style={{
            flexShrink: 0,
            padding: 15,
            borderRadius: 6,
            border: `1px solid ${theme.tableBorder}`,
            gap: 10,
          }}
        >
          <LabeledCheckbox
            checked={enableYearMode}
            onChange={() => setEnableYearMode(!enableYearMode)}
            id="enable-year-mode-checkbox"
          >
            <Text style={{ fontWeight: 600 }}>
              <Trans>Use calendar years on timeline ('26, '27...)</Trans>
            </Text>
          </LabeledCheckbox>
          <View style={{ paddingLeft: 26, gap: 5 }}>
            <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
              <Trans values={{ currentYear: getCurrentYear() }}>
                Easier for couples of different ages. Tracks progress by
                calendar year from {'{{currentYear}}'} forward.
              </Trans>
              {cspData.userBirthYear && (
                <Text
                  as="span"
                  style={{
                    display: 'block',
                    marginTop: 4,
                    color: theme.pageText,
                  }}
                >
                  <Trans
                    values={{
                      userYear: cspData.userBirthYear,
                      partnerPart: cspData.spouseBirthYear
                        ? `, ${cspData.spouseName || 'Nicole'} (born ${cspData.spouseBirthYear})`
                        : '',
                    }}
                  >
                    Age hints enabled: You (born {'{{userYear}}'})
                    {'{{partnerPart}}'}
                  </Trans>
                </Text>
              )}
            </Text>
          </View>
        </View>

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
            <Trans>Cancel</Trans>
          </Button>
          <Button
            variant="primary"
            style={{
              padding: '8px 22px',
              minHeight: 36,
              fontSize: 14,
              fontWeight: 600,
            }}
            onPress={handleApply}
          >
            <Trans>Apply to Monte Carlo</Trans>
          </Button>
        </View>
      </View>
    </Modal>
  );
}
