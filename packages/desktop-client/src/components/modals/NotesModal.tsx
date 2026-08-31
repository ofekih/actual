// @ts-strict-ignore
import React, { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgCheck } from '@actual-app/components/icons/v2';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { Notes } from '#components/Notes';
import { useLocale } from '#hooks/useLocale';
import { useNoteInfo } from '#hooks/useNotes';
import type { Modal as ModalType } from '#modals/modalsSlice';

type NotesModalProps = Extract<ModalType, { name: 'notes' }>['options'];

export function NotesModal({ id, name, onSave }: NotesModalProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const noteInfo = useNoteInfo(id);
  const originalNotes = noteInfo.note ?? '';

  const [notes, setNotes] = useState(originalNotes);
  useEffect(() => setNotes(originalNotes), [originalNotes]);

  function _onSave() {
    if (notes !== originalNotes) {
      onSave?.(id, notes);
    }
  }

  return (
    <Modal
      name="notes"
      containerProps={{
        style: { height: '50vh' },
      }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Notes: {{name}}', { name })}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View
            style={{
              flex: 1,
              flexDirection: 'column',
            }}
          >
            {noteInfo.isInherited && noteInfo.sourceMonth && (
              <View style={{ paddingBottom: 6 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.pageTextSubdued,
                    fontStyle: 'italic',
                  }}
                >
                  <Trans>
                    Inherited from{' '}
                    {{
                      month: monthUtils.format(
                        noteInfo.sourceMonth,
                        "MMMM ''yy",
                        locale,
                      ),
                    }}
                  </Trans>
                </Text>
              </View>
            )}
            <Notes
              notes={notes}
              editable
              focused
              getStyle={() => ({
                borderRadius: 6,
                flex: 1,
                minWidth: 0,
              })}
              onChange={setNotes}
            />
            <View
              style={{
                flexDirection: 'column',
                alignItems: 'center',
                justifyItems: 'center',
                width: '100%',
                paddingTop: 10,
              }}
            >
              <Button
                variant="primary"
                style={{
                  fontSize: 17,
                  fontWeight: 400,
                  width: '100%',
                }}
                onPress={() => {
                  _onSave();
                  state.close();
                }}
              >
                <SvgCheck width={17} height={17} style={{ paddingRight: 5 }} />
                <Trans>Save notes</Trans>
              </Button>
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
