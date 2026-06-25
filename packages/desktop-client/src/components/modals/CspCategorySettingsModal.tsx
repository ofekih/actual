import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Paragraph } from '@actual-app/components/paragraph';
import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import type { Modal as ModalType } from '#modals/modalsSlice';

type CspCategorySettingsModalProps = Extract<
  ModalType,
  { name: 'csp-category-settings' }
>['options'];

export function CspCategorySettingsModal({
  category,
  onSave,
}: CspCategorySettingsModalProps) {
  const { t } = useTranslation();

  const initialWindow = String(category.moving_average_months || 0);

  const [movingAverageMonths, setMovingAverageMonths] = useState(initialWindow);

  const handleSave = (closeModal: () => void) => {
    const windowVal = parseInt(movingAverageMonths, 10);
    const moving_average_months = windowVal > 0 ? windowVal : null;

    onSave({ moving_average_months });
    closeModal();
  };

  const auditWindowOptions: [string, string][] = [
    ['0', t('None (Actual Spent)')],
    ['3', t('3 Months')],
    ['6', t('6 Months')],
    ['12', t('12 Months')],
    ['24', t('24 Months')],
  ];

  return (
    <Modal
      name="csp-category-settings"
      containerProps={{ style: { width: 500 } }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Category Smoothing: {{name}}', {
              name: category.name,
            })}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <Paragraph style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
            <Trans>
              Use these settings to optionally smooth out irregular or large
              expenses in your Conscious Spending Plan.
            </Trans>
          </Paragraph>
          <Paragraph style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
            <Trans>
              Setting a <strong>Moving Average Period</strong> replaces the
              actual monthly spending with an average to better reflect
              long-term trends. You can edit the <strong>Target Amount</strong>{' '}
              directly by clicking on it in the table.
            </Trans>
          </Paragraph>

          <View style={{ gap: 15, marginTop: 15 }}>
            <View style={{ flexDirection: 'column', gap: 5 }}>
              <Text style={{ fontWeight: 'bold', color: theme.formLabelText }}>
                <Trans>Moving Average Period</Trans>
              </Text>
              <Select
                options={auditWindowOptions}
                value={movingAverageMonths}
                onChange={setMovingAverageMonths}
              />
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              gap: 10,
              marginTop: 20,
            }}
          >
            <Button onPress={() => state.close()}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="primary"
              onPress={() => handleSave(() => state.close())}
            >
              <Trans>Save</Trans>
            </Button>
          </View>
        </>
      )}
    </Modal>
  );
}
