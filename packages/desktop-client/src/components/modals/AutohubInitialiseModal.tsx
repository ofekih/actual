// @ts-strict-ignore
import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { ButtonWithLoading } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';

import { Error } from '#components/alerts';
import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
} from '#components/common/Modal';
import { FormField, FormLabel } from '#components/forms';
import type { Modal as ModalType } from '#modals/modalsSlice';
import { getSecretsError } from '#util/error';

type AutohubInitialiseModalProps = Extract<
  ModalType,
  { name: 'autohub-init' }
>['options'];

export const AutohubInitialiseModal = ({
  onSuccess,
}: AutohubInitialiseModalProps) => {
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const [isValid, setIsValid] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(
    t('It is required to provide an API key.'),
  );

  const onSubmit = async (close: () => void) => {
    if (!key) {
      setIsValid(false);
      return;
    }

    setIsLoading(true);

    const { error, reason } =
      (await send('secret-set', {
        name: 'autohub_apiKey',
        value: key,
      })) || {};

    if (error) {
      setIsValid(false);
      setError(getSecretsError(error, reason));
    } else {
      onSuccess();
    }
    setIsLoading(false);
    close();
  };

  return (
    <Modal name="autohub-init" containerProps={{ style: { width: 300 } }}>
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Set up Autohub')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ display: 'flex', gap: 10 }}>
            <Text>
              <Trans>
                In order to enable Account Sync via Autohub (for vehicle
                depreciation tracking), you will need to provide your RapidAPI
                key for the Autohub API.
              </Trans>
            </Text>

            <FormField>
              <FormLabel title={t('API Key:')} htmlFor="key-field" />
              <Input
                id="key-field"
                type="password"
                value={key}
                onChangeValue={value => {
                  setKey(value);
                  setIsValid(true);
                }}
              />
            </FormField>

            {!isValid && <Error>{error}</Error>}
          </View>

          <ModalButtons>
            <ButtonWithLoading
              variant="primary"
              autoFocus
              isLoading={isLoading}
              onPress={() => {
                void onSubmit(() => state.close());
              }}
            >
              <Trans>Save and exit</Trans>
            </ButtonWithLoading>
          </ModalButtons>
        </>
      )}
    </Modal>
  );
};
