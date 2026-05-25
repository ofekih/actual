import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { send } from '@actual-app/core/platform/client/connection';

import { useSyncedPref } from '#hooks/useSyncedPref';

import { Setting } from './UI';

export function AISettings() {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useSyncedPref('geminiApiKey');
  const [isTesting, setIsTesting] = React.useState(false);
  const [isCategorizing, setIsCategorizing] = React.useState(false);
  const [testResult, setTestResult] = React.useState<string | null>(null);

  const onTestConnection = async () => {
    setIsTesting(true);
    try {
      setTestResult(null);
      const response = await send('ai-test-connection');
      if (response.success) {
        setTestResult('Connection Successful! Gemini says: ' + response.message);
      } else {
        setTestResult('Connection Failed: ' + response.message);
      }
    } catch (e: any) {
      setTestResult('Error: ' + (e.message || JSON.stringify(e, null, 2)));
    } finally {
      setIsTesting(false);
    }
  };

  const onTestCategorize = async () => {
    setIsCategorizing(true);
    try {
      setTestResult(null);
      const result = await send('ai-test-categorize-random');
      setTestResult(
        `Transaction: ${result.transactionInfo}\n\n` +
        `Categorization Result:\n` +
        `- Standard Category ID: ${result.standard_category_id}\n` +
        `- CSP Category ID: ${result.csp_category_id}\n` +
        `- Confidence: ${result.confidence}\n` +
        `- Reasoning: ${result.reasoning}\n` +
        `- Suggest Rule: ${result.suggest_rule}`
      );
    } catch (e: any) {
      setTestResult('Error: ' + (e.message || JSON.stringify(e, null, 2)));
    } finally {
      setIsCategorizing(false);
    }
  };

  return (
    <Setting
      primaryAction={
        <View style={{ flexDirection: 'column', gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Input
              type="password"
              value={apiKey || ''}
              placeholder={t('Enter Gemini API Key')}
              onChange={e => setApiKey(e.currentTarget.value)}
              style={{ width: 300 }}
            />
            <Button onPress={onTestConnection} /* isLoading={isTesting} */>
              <Trans>Test Connection</Trans>
            </Button>
          </View>
          <View>
            <Button onPress={onTestCategorize} /* isLoading={isCategorizing} */>
              <Trans>Test Categorization</Trans>
            </Button>
          </View>
          {testResult && (
            <View style={{ marginTop: 10, padding: 10, backgroundColor: 'var(--color-background)', borderRadius: 4 }}>
              <Text style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                {testResult}
              </Text>
            </View>
          )}
        </View>
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
