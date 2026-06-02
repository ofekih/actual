import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { ButtonWithLoading } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';

import { useSyncedPref } from '#hooks/useSyncedPref';

import { Setting } from './UI';

export function AISettings() {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useSyncedPref('geminiApiKey');
  const [isTesting, setIsTesting] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const onTestConnection = async () => {
    setIsTesting(true);
    try {
      setTestResult(null);
      const response = await send('ai-test-connection');
      if (response.success) {
        setTestResult(
          'Connection Successful! Gemini says: ' + response.message,
        );
      } else {
        setTestResult('Connection Failed: ' + response.message);
      }
    } catch (e) {
      setTestResult(
        'Error: ' +
          (e instanceof Error
            ? e.message
            : typeof e === 'object' && e !== null
              ? JSON.stringify(e, null, 2)
              : String(e)),
      );
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
          `- Standard Category ID: ${result.standard_category_id || 'None'}\n` +
          `- CSP Category ID: ${result.csp_category_id || 'None'}\n` +
          `- Suggested Standard Category: ${result.suggested_new_standard_category || 'None'} (Group ID: ${result.suggested_standard_category_group_id || 'None'})\n` +
          `- Suggested CSP Category: ${result.suggested_new_csp_category || 'None'} (Group ID: ${result.suggested_csp_category_group_id || 'None'})\n` +
          `- Confidence: ${result.confidence}\n` +
          `- Reasoning: ${result.reasoning}`,
      );
    } catch (e) {
      setTestResult(
        'Error: ' +
          (e instanceof Error
            ? e.message
            : typeof e === 'object' && e !== null
              ? JSON.stringify(e, null, 2)
              : String(e)),
      );
    } finally {
      setIsCategorizing(false);
    }
  };

  const onSeedCategories = async () => {
    setIsSeeding(true);
    try {
      setTestResult(null);
      await send('ai-seed-categories');
      setTestResult(
        'Successfully seeded default Standard and CSP categories! (Note: existing categories were cleared)',
      );
    } catch (e) {
      setTestResult(
        'Error: ' +
          (e instanceof Error
            ? e.message
            : typeof e === 'object' && e !== null
              ? JSON.stringify(e, null, 2)
              : String(e)),
      );
    } finally {
      setIsSeeding(false);
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
            <ButtonWithLoading onPress={onTestConnection} isLoading={isTesting}>
              <Trans>Test Connection</Trans>
            </ButtonWithLoading>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <ButtonWithLoading
              onPress={onTestCategorize}
              isLoading={isCategorizing}
            >
              <Trans>Test Categorization</Trans>
            </ButtonWithLoading>
            <ButtonWithLoading onPress={onSeedCategories} isLoading={isSeeding}>
              <Trans>Seed Default Categories</Trans>
            </ButtonWithLoading>
          </View>
          {testResult && (
            <View
              style={{
                marginTop: 10,
                padding: 10,
                backgroundColor: 'var(--color-background)',
                borderRadius: 4,
              }}
            >
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
          <strong>AI Auto-Categorization</strong> requires a Gemini API Key from
          Google Cloud. This key is stored securely in your local budget file.
        </Trans>
      </Text>
    </Setting>
  );
}
