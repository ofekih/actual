import { useState } from 'react';
import type { FormEvent } from 'react';
import { Form } from 'react-aria-components';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { FormError } from '@actual-app/components/form-error';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { InlineField } from '@actual-app/components/inline-field';
import { Input } from '@actual-app/components/input';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';

import { useCreateAccountMutation } from '#accounts';
import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import { useNavigate } from '#hooks/useNavigate';
import { closeModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

export function CreateAssetAccountModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [name, setName] = useState('');
  const [vin, setVin] = useState('');
  const [mileage, setMileage] = useState('');

  const [error, setError] = useState<string | null>(null);

  const createAccount = useCreateAccountMutation();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name || !vin || !mileage) {
      setError(t('All fields are required.'));
      return;
    }

    createAccount.mutate(
      {
        name,
        balance: 0,
        offBudget: true,
      },
      {
        onSuccess: async id => {
          // Immediately update the account to add the Autohub asset details
          await send('account-update', {
            id,
            name,
            account_id: `${vin}|${mileage}`,
            account_sync_source: 'autohub',
          });

          // Sync the newly created account so we fetch the initial depreciation value
          await send('accounts-bank-sync', { ids: [id] });

          dispatch(closeModal());
          void navigate('/accounts/' + id);
        },
      },
    );
  };
  return (
    <Modal name="add-asset-account">
      {({ state }) => (
        <>
          <ModalHeader
            title={
              <ModalTitle title={t('Track Autohub Asset')} shrinkOnOverflow />
            }
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View>
            <Form onSubmit={onSubmit}>
              <InlineField label={t('Account Name')} width="100%">
                <InitialFocus>
                  <Input
                    name="name"
                    value={name}
                    placeholder="e.g. My Mazda CX-5"
                    onChangeValue={setName}
                    style={{ flex: 1 }}
                  />
                </InitialFocus>
              </InlineField>

              <InlineField label={t('VIN')} width="100%">
                <Input
                  name="vin"
                  value={vin}
                  placeholder="e.g. jm3kkbha5r1166850"
                  onChangeValue={setVin}
                  style={{ flex: 1 }}
                />
              </InlineField>

              <InlineField label={t('Mileage')} width="100%">
                <Input
                  name="mileage"
                  value={mileage}
                  placeholder="e.g. 50000"
                  onChangeValue={setMileage}
                  style={{ flex: 1 }}
                />
              </InlineField>

              {error && (
                <FormError style={{ marginLeft: 75, marginTop: 10 }}>
                  {error}
                </FormError>
              )}

              <ModalButtons style={{ marginTop: 20 }}>
                <Button onPress={() => state.close()}>
                  <Trans>Back</Trans>
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  style={{ marginLeft: 10 }}
                >
                  <Trans>Create</Trans>
                </Button>
              </ModalButtons>
            </Form>
          </View>
        </>
      )}
    </Modal>
  );
}
