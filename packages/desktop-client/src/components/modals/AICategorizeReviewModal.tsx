import React, { useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import type { CategorizeResult } from '@actual-app/core/server/ai/categorize';
import { q } from '@actual-app/core/shared/query';

import {
  Modal,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import { CategoryAutocomplete } from '#components/autocomplete/CategoryAutocomplete';
import { Select } from '@actual-app/components/select';
import { theme } from '@actual-app/components/theme';
import { Checkbox } from '#components/forms';
import { SheetNameProvider } from '#hooks/useSheetName';
import * as monthUtils from '@actual-app/core/shared/months';
import { useCategories } from '#hooks/useCategories';
import { useCspCategories } from '#hooks/useCspCategories';
import { useFormat } from '#hooks/useFormat';
import type { Modal as ModalType } from '#modals/modalsSlice';

type AICategorizeReviewModalProps = Extract<
  ModalType,
  { name: 'ai-categorize-review' }
>['options'];

export function AICategorizeReviewModal({
  transactionId,
}: AICategorizeReviewModalProps) {
  const { t } = useTranslation();
  const { data: { list: categories, grouped: categoryGroups } = { list: [], grouped: [] } } = useCategories();
  const { data: { list: cspCategories } = { list: [] } } = useCspCategories();
  const format = useFormat();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CategorizeResult | null>(null);
  const [transactionInfo, setTransactionInfo] = useState<any>(null);

  const [selectedStandardId, setSelectedStandardId] = useState<string | null>(null);
  const [selectedCspId, setSelectedCspId] = useState<string | null>(null);
  const [createRule, setCreateRule] = useState<boolean>(false);

  useEffect(() => {
    async function fetchCategorization() {
      try {
        const { data } = await send(
          'query',
          q('transactions')
            .filter({ id: transactionId })
            .select(['*', 'payee.name'])
            .serialize(),
        );

        if (data && data.length > 0) {
          setTransactionInfo(data[0]);
          const res = await send('ai-categorize-transaction', {
            transactionId,
            payeeName: data[0]['payee.name'],
          });
          setResult(res);
          setSelectedStandardId(res.standard_category_id);
          setSelectedCspId(res.csp_category_id);
          setCreateRule(res.suggest_rule);
        } else {
          setError(t('Transaction not found.'));
        }
      } catch (err: any) {
        setError(err.message || String(err));
      } finally {
        setIsLoading(false);
      }
    }
    fetchCategorization();
  }, [transactionId, t]);

  const onAccept = async () => {
    if (!result) return;
    setIsLoading(true);
    try {
      const { standard_category_id, csp_category_id } = await send(
        'ai-apply-categorization',
        {
          standard_category_id: selectedStandardId,
          csp_category_id: selectedCspId,
          is_income: transactionInfo?.amount > 0,
          suggested_new_standard_category:
            result.suggested_new_standard_category
              ? {
                  name: result.suggested_new_standard_category,
                  groupId: result.suggested_standard_category_group_id!,
                }
              : null,
          suggested_new_csp_category: result.suggested_new_csp_category
            ? {
                name: result.suggested_new_csp_category,
                groupId: result.suggested_csp_category_group_id!,
              }
            : null,
        },
      );

      const updates: any = { id: transactionId };
      if (standard_category_id !== undefined)
        updates.category = standard_category_id;
      if (csp_category_id !== undefined) updates.csp_category = csp_category_id;

      await send('transaction-update', updates);

      // In Phase 4 we will handle rule creation if `result.suggest_rule` is true
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal name="ai-categorize-review" isLoading={isLoading}>
      {({ state }) => (
        <>
          <ModalHeader
            title={
              <ModalTitle
                title={t('AI Categorization Review')}
                shrinkOnOverflow
              />
            }
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ gap: 15, padding: 15, minWidth: 650 }}>
            {error ? (
              <Text style={{ color: theme.errorText }}>{error}</Text>
            ) : (
              <>
                {transactionInfo && result && (
                  <View style={{ gap: 15 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        backgroundColor: theme.tableBackground,
                        border: `1px solid ${theme.tableBorder}`,
                        borderRadius: 4,
                        borderLeft: `4px solid ${
                          result.confidence === 'high'
                            ? theme.noticeTextLight
                            : result.confidence === 'medium'
                              ? theme.warningText
                              : theme.errorText
                        }`,
                        alignItems: 'center',
                        padding: '10px 15px',
                        gap: 15,
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 80 }}>
                        <Text style={{ color: theme.pageTextLight, fontSize: 12, marginBottom: 2 }}>{t('Date')}</Text>
                        <Text>{transactionInfo.date}</Text>
                      </View>
                      
                      <View style={{ flex: 2, minWidth: 120 }}>
                        <Text style={{ color: theme.pageTextLight, fontSize: 12, marginBottom: 2 }}>{t('Payee')}</Text>
                        <Text style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{transactionInfo['payee.name'] || t('Unknown')}</Text>
                      </View>
                      
                      <View style={{ flex: 1, minWidth: 80, alignItems: 'flex-end' }}>
                        <Text style={{ color: theme.pageTextLight, fontSize: 12, marginBottom: 2 }}>{t('Amount')}</Text>
                        <Text>{format(transactionInfo.amount, 'financial')}</Text>
                      </View>

                      <View style={{ width: 1, height: 30, backgroundColor: theme.tableBorder, marginHorizontal: 5 }} />

                      <View style={{ flex: 2, minWidth: 150 }}>
                        <Text style={{ color: theme.pageTextLight, fontSize: 12, marginBottom: 2 }}>{t('Category')}</Text>
                        <SheetNameProvider name={monthUtils.sheetForMonth(monthUtils.monthFromDate(transactionInfo.date))}>
                          <CategoryAutocomplete
                            categoryGroups={categoryGroups}
                            value={selectedStandardId}
                            onSelect={(id) => setSelectedStandardId(id)}
                            showSplitOption={false}
                            inputProps={{ placeholder: t('Select category...') }}
                          />
                        </SheetNameProvider>
                      </View>

                      <View style={{ flex: 2, minWidth: 150 }}>
                        <Text style={{ color: theme.pageTextLight, fontSize: 12, marginBottom: 2 }}>{t('CSP Category')}</Text>
                        <Select
                          options={[['', t('Uncategorized')], ...cspCategories.map(c => [c.id, c.name] as [string, string])]}
                          value={selectedCspId || ''}
                          onChange={(val) => setSelectedCspId(val === '' ? null : val)}
                        />
                      </View>
                    </View>

                    <Text style={{ fontSize: 13, color: theme.pageTextLight, fontStyle: 'italic' }}>
                      <span style={{ fontWeight: 600 }}>{t('Reasoning')}:</span> {result.reasoning}
                    </Text>

                    {result.suggest_rule && (
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: theme.pillBackgroundSelected,
                        padding: 10,
                        borderRadius: 4,
                        gap: 10
                      }}>
                        <Checkbox
                          id="create-rule"
                          checked={createRule}
                          onChange={(e) => setCreateRule(e.target.checked)}
                        />
                        <View style={{ flex: 1 }}>
                          <label htmlFor="create-rule" style={{ fontWeight: 600, userSelect: 'none', cursor: 'pointer' }}>
                            ✨ {t('Create a rule for this payee')}
                          </label>
                          <Text style={{ fontSize: 12, color: theme.pageTextLight, marginTop: 2 }}>
                            {t('Automatically categorize future transactions for')} "{transactionInfo['payee.name']}"
                          </Text>
                        </View>
                      </View>
                    )}

                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                      <Button onPress={() => state.close()}>{t('Cancel')}</Button>
                      <Button variant="primary" onPress={async () => {
                        await onAccept();
                        state.close();
                      }}>
                        {t('Accept & Save')}
                      </Button>
                    </View>
                  </View>
                )}
              </>
            )}
          </View>
        </>
      )}
    </Modal>
  );
}
