import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Paragraph } from '@actual-app/components/paragraph';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { DEMO_BUDGET_ID } from '@actual-app/core/shared/constants';
import {
  amountToInteger,
  integerToAmount,
  looselyParseAmount,
} from '@actual-app/core/shared/util';
import type { DemoModeOptions } from '@actual-app/core/types/prefs';

import { enterDemoMode, exitDemoMode } from '#budgetfiles/budgetfilesSlice';
import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { LabeledCheckbox } from '#components/forms/LabeledCheckbox';
import { useMetadataPref } from '#hooks/useMetadataPref';
import { useDispatch } from '#redux';

const DEFAULT_OPTIONS: DemoModeOptions = {
  months: 3,
  scaleEnabled: false,
  targetMonthlyIncome: 600000,
  savingsBalance: 1500000,
  investmentsBalance: 10000000,
  debtBalance: 0,
  hideClosedAccounts: true,
  stripTransactionNotes: false,
};

function parseDollarInput(value: string, fallbackCents: number): number {
  const parsed = looselyParseAmount(value);
  if (parsed === null || Number.isNaN(parsed)) {
    return fallbackCents;
  }
  return amountToInteger(parsed);
}

export function DemoModeModal() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [budgetId] = useMetadataPref('id');
  const [savedOptions] = useMetadataPref('demoOptions');

  const initial: DemoModeOptions = {
    ...DEFAULT_OPTIONS,
    ...savedOptions,
  };

  const isInDemoMode = budgetId === DEMO_BUDGET_ID;

  const [months, setMonths] = useState(String(initial.months));
  const [scaleEnabled, setScaleEnabled] = useState(initial.scaleEnabled);
  const [targetMonthlyIncome, setTargetMonthlyIncome] = useState(
    String(integerToAmount(initial.targetMonthlyIncome)),
  );
  const [savingsBalance, setSavingsBalance] = useState(
    String(integerToAmount(initial.savingsBalance)),
  );
  const [investmentsBalance, setInvestmentsBalance] = useState(
    String(integerToAmount(initial.investmentsBalance)),
  );
  const [debtBalance, setDebtBalance] = useState(
    String(integerToAmount(initial.debtBalance)),
  );
  const [hideClosedAccounts, setHideClosedAccounts] = useState(
    initial.hideClosedAccounts,
  );
  const [stripTransactionNotes, setStripTransactionNotes] = useState(
    initial.stripTransactionNotes,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleApply = async (close: () => void) => {
    setIsSubmitting(true);
    const parsedMonths = parseInt(months, 10);
    const clampedMonths = Number.isFinite(parsedMonths)
      ? Math.max(1, Math.min(36, parsedMonths))
      : DEFAULT_OPTIONS.months;

    const options: DemoModeOptions = {
      months: clampedMonths,
      scaleEnabled,
      targetMonthlyIncome: Math.max(
        100,
        parseDollarInput(
          targetMonthlyIncome,
          DEFAULT_OPTIONS.targetMonthlyIncome,
        ),
      ),
      savingsBalance: parseDollarInput(
        savingsBalance,
        DEFAULT_OPTIONS.savingsBalance,
      ),
      investmentsBalance: parseDollarInput(
        investmentsBalance,
        DEFAULT_OPTIONS.investmentsBalance,
      ),
      debtBalance: parseDollarInput(debtBalance, DEFAULT_OPTIONS.debtBalance),
      hideClosedAccounts,
      stripTransactionNotes,
    };

    close();
    await dispatch(enterDemoMode({ options }));
  };

  const handleExit = async (close: () => void) => {
    setIsSubmitting(true);
    close();
    await dispatch(exitDemoMode());
  };

  return (
    <Modal name="demo-mode" containerProps={{ style: { width: 520 } }}>
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Demo Mode')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <Paragraph style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
            <Trans>
              Create a temporary, offline clone of your current budget with
              synthetic account balances and a limited history window. Your real
              budget and cloud sync remain untouched.
            </Trans>
          </Paragraph>

          <View style={{ gap: 14, marginTop: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: 600, color: theme.formLabelText }}>
                  <Trans>Sample months to include</Trans>
                </Text>
                <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                  <Trans>
                    Older transactions are removed and forward-amortized
                    expenses are preserved.
                  </Trans>
                </Text>
              </View>
              <Input
                type="number"
                min={1}
                max={36}
                value={months}
                onChangeValue={setMonths}
                style={{ width: 90, textAlign: 'right' }}
              />
            </View>

            <View
              style={{
                borderTop: `1px solid ${theme.tableBorder}`,
                paddingTop: 12,
                gap: 8,
              }}
            >
              <LabeledCheckbox
                id="demo-scale-enabled"
                checked={scaleEnabled}
                onChange={() => setScaleEnabled(!scaleEnabled)}
              >
                <Text style={{ fontWeight: 600 }}>
                  <Trans>Scale monthly cash flow</Trans>
                </Text>
              </LabeledCheckbox>
              <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                <Trans>
                  Proportionally scales all transactions and targets so your
                  Conscious Spending Plan percentages stay identical.
                </Trans>
              </Text>
              {scaleEnabled && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 4,
                  }}
                >
                  <Text style={{ fontSize: 13 }}>
                    <Trans>Target monthly income ($)</Trans>
                  </Text>
                  <Input
                    inputMode="decimal"
                    value={targetMonthlyIncome}
                    onChangeValue={setTargetMonthlyIncome}
                    style={{ width: 140, textAlign: 'right' }}
                  />
                </View>
              )}
            </View>

            <View
              style={{
                borderTop: `1px solid ${theme.tableBorder}`,
                paddingTop: 12,
                gap: 8,
              }}
            >
              <Text style={{ fontWeight: 600, color: theme.formLabelText }}>
                <Trans>Demo Account Balances ($)</Trans>
              </Text>
              <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                <Trans>
                  Replaces starting balances for Savings, Investments, and Debt.
                  Asset accounts are kept untouched.
                </Trans>
              </Text>

              <View
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 10,
                  marginTop: 4,
                }}
              >
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                    <Trans>Savings / Cash</Trans>
                  </Text>
                  <Input
                    inputMode="decimal"
                    value={savingsBalance}
                    onChangeValue={setSavingsBalance}
                  />
                </View>

                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                    <Trans>Investments</Trans>
                  </Text>
                  <Input
                    inputMode="decimal"
                    value={investmentsBalance}
                    onChangeValue={setInvestmentsBalance}
                  />
                </View>

                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                    <Trans>Debt</Trans>
                  </Text>
                  <Input
                    inputMode="decimal"
                    value={debtBalance}
                    onChangeValue={setDebtBalance}
                  />
                </View>
              </View>
            </View>

            <View
              style={{
                borderTop: `1px solid ${theme.tableBorder}`,
                paddingTop: 12,
                gap: 6,
              }}
            >
              <LabeledCheckbox
                id="demo-hide-closed"
                checked={hideClosedAccounts}
                onChange={() => setHideClosedAccounts(!hideClosedAccounts)}
              >
                <Trans>Hide closed accounts</Trans>
              </LabeledCheckbox>

              <LabeledCheckbox
                id="demo-strip-notes"
                checked={stripTransactionNotes}
                onChange={() =>
                  setStripTransactionNotes(!stripTransactionNotes)
                }
              >
                <Trans>Strip transaction notes (keep #tags)</Trans>
              </LabeledCheckbox>
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              marginTop: 20,
            }}
          >
            <View>
              {isInDemoMode && (
                <Button
                  onPress={() => void handleExit(() => state.close())}
                  isDisabled={isSubmitting}
                >
                  <Trans>Exit Demo Mode</Trans>
                </Button>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button onPress={() => state.close()} isDisabled={isSubmitting}>
                <Trans>Cancel</Trans>
              </Button>
              <Button
                variant="primary"
                onPress={() => void handleApply(() => state.close())}
                isDisabled={isSubmitting}
              >
                {isInDemoMode ? (
                  <Trans>Rebuild Demo</Trans>
                ) : (
                  <Trans>Enter Demo Mode</Trans>
                )}
              </Button>
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
