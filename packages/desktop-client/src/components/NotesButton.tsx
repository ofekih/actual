import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgCustomNotesPaper } from '@actual-app/components/icons/v2';
import { Popover } from '@actual-app/components/popover';
import type { CSSProperties } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import { css, cx } from '@emotion/css';

import { useLocale } from '#hooks/useLocale';
import { useNoteInfo } from '#hooks/useNotes';

import { Notes } from './Notes';

type NotesButtonProps = {
  id: string;
  width?: number;
  height?: number;
  defaultColor?: string;
  tooltipPosition?: ComponentProps<typeof Tooltip>['placement'];
  showPlaceholder?: boolean;
  style?: CSSProperties;
};
export function NotesButton({
  id,
  width = 12,
  height = 12,
  defaultColor = theme.buttonNormalText,
  tooltipPosition = 'bottom start',
  showPlaceholder = false,
  style,
}: NotesButtonProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const triggerRef = useRef(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const noteInfo = useNoteInfo(id);
  const note = noteInfo.note || '';
  const hasNotes = note && note !== '';

  const [tempNotes, setTempNotes] = useState<string>(note);
  useEffect(() => setTempNotes(note), [note, id]);

  const onOpenChange = useCallback<
    NonNullable<ComponentProps<typeof Popover>['onOpenChange']>
  >(
    isOpen => {
      if (!isOpen) {
        if (tempNotes !== note) {
          void send('notes-save', { id, note: tempNotes });
        }
        setIsOpen(false);
      }
    },
    [id, note, tempNotes],
  );

  return (
    <Tooltip
      content={
        <View>
          {noteInfo.isInherited && noteInfo.sourceMonth && (
            <Text
              style={{
                fontSize: 11,
                color: theme.pageTextSubdued,
                fontStyle: 'italic',
                marginBottom: 4,
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
          )}
          <Notes notes={note} />
        </View>
      }
      placement={tooltipPosition}
      triggerProps={{
        isDisabled: !hasNotes || isOpen,
      }}
    >
      <View style={{ flexShrink: 0 }}>
        <Button
          ref={triggerRef}
          variant="bare"
          aria-label={t('View notes')}
          className={cx(
            css({
              color: defaultColor,
              ...style,
              padding: 4,
              ...(showPlaceholder && {
                opacity: hasNotes || isOpen ? 1 : 0.3,
              }),
              ...(isOpen && { color: theme.buttonNormalText }),
              '&:hover': { opacity: 1 },
            }),
            !hasNotes && !isOpen && !showPlaceholder ? 'hover-visible' : '',
          )}
          data-placeholder={showPlaceholder}
          onPress={() => {
            setIsOpen(true);
          }}
        >
          <SvgCustomNotesPaper style={{ width, height, flexShrink: 0 }} />
        </Button>
      </View>

      <Popover
        triggerRef={triggerRef}
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        placement={tooltipPosition}
        style={{ padding: 6, minWidth: 200 }}
      >
        {noteInfo.isInherited && noteInfo.sourceMonth && (
          <View
            style={{
              paddingBottom: 4,
              marginBottom: 4,
              borderBottom: `1px solid ${theme.tableBorder}`,
            }}
          >
            <Text
              style={{
                fontSize: 11,
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
        <Notes notes={tempNotes} editable focused onChange={setTempNotes} />
      </Popover>
    </Tooltip>
  );
}
