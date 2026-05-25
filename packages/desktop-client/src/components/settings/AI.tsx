import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';

import { useSyncedPref } from '#hooks/useSyncedPref';

import { Setting } from './UI';

export function AISettings() {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useSyncedPref('geminiApiKey');

  return (
    <Setting
      primaryAction={
        <Input
          type="password"
          value={apiKey || ''}
          placeholder={t('Enter Gemini API Key')}
          onChange={e => setApiKey(e.currentTarget.value)}
          style={{ width: 300 }}
        />
      }
    >
      <Text>
        <Trans>
          <strong>AI Auto-Categorization</strong> requires a Gemini API Key from Google Cloud.
          This key is stored securely in your local budget file.
        </Trans>
      </Text>
    </Setting>
  );
}
