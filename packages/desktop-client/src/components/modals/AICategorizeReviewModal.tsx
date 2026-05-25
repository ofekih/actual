import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Modal, ModalCloseButton, ModalHeader, ModalTitle } from '#components/common/Modal';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { useCategories } from '#hooks/useCategories';
import { useFormat } from '#hooks/useFormat';
import type { Modal as ModalType } from '#modals/modalsSlice';
import { send } from '@actual-app/core/platform/client/connection';
import { q } from '@actual-app/core/shared/query';
import type { CategorizeResult } from '@actual-app/core/server/ai/categorize';

type AICategorizeReviewModalProps = Extract<
  ModalType,
  { name: 'ai-categorize-review' }
>['options'];

export function AICategorizeReviewModal({
  transactionId,
}: AICategorizeReviewModalProps) {
  const { t } = useTranslation();
  const { data: { list: categories } = { list: [] } } = useCategories();
  const [cspCategories, setCspCategories] = useState<any[]>([]);
  const format = useFormat();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CategorizeResult | null>(null);
  const [transactionInfo, setTransactionInfo] = useState<any>(null);

  useEffect(() => {
    async function fetchCategorization() {
      try {
        const { data: cspData } = await send('query', q('csp_categories').select('*').serialize());
        if (cspData) setCspCategories(cspData);

        const { data } = await send('query', q('transactions').filter({ id: transactionId }).select(['*', 'payee.name']).serialize());
        
        if (data && data.length > 0) {
          setTransactionInfo(data[0]);
          const res = await send('ai-categorize-transaction', {
            transactionId,
            payeeName: data[0]['payee.name']
          });
          setResult(res);
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
      const { standard_category_id, csp_category_id } = await send('ai-apply-categorization', {
        standard_category_id: result.standard_category_id,
        csp_category_id: result.csp_category_id,
        is_income: transactionInfo?.amount > 0,
        suggested_new_standard_category: result.suggested_new_standard_category ? {
          name: result.suggested_new_standard_category,
          groupId: result.suggested_standard_category_group_id!
        } : null,
        suggested_new_csp_category: result.suggested_new_csp_category ? {
          name: result.suggested_new_csp_category,
          groupId: result.suggested_csp_category_group_id!
        } : null,
      });

      const updates: any = { id: transactionId };
      if (standard_category_id !== undefined) updates.category = standard_category_id;
      if (csp_category_id !== undefined) updates.csp_category = csp_category_id;

      await send('transaction-update', updates);
      
      // In Phase 4 we will handle rule creation if `result.suggest_rule` is true
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const getStandardName = () => {
    if (result?.suggested_new_standard_category) {
      return `✨ New: ${result.suggested_new_standard_category}`;
    }
    if (result?.standard_category_id) {
      const cat = categories.find(c => c.id === result.standard_category_id);
      return cat ? cat.name : result.standard_category_id;
    }
    return 'None';
  };

  const getCspName = () => {
    if (result?.suggested_new_csp_category) {
      return `✨ New: ${result.suggested_new_csp_category}`;
    }
    if (result?.csp_category_id) {
      const cat = cspCategories.find(c => c.id === result.csp_category_id);
      return cat ? cat.name : result.csp_category_id;
    }
    return 'None';
  };

  return (
    <Modal
      name="ai-categorize-review"
      isLoading={isLoading}
    >
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
          <View style={{ gap: 15, padding: 5, minWidth: 400 }}>
            {error ? (
              <Text style={{ color: 'var(--color-error)' }}>{error}</Text>
            ) : (
              <>
                {transactionInfo && (
                  <View style={{ backgroundColor: 'var(--color-background)', padding: 15, borderRadius: 4, gap: 5 }}>
                    <Text style={{ fontWeight: 'bold' }}>{t('Transaction')}</Text>
                    <Text>{t('Payee')}: {transactionInfo['payee.name'] || t('Unknown')}</Text>
                    <Text>{t('Amount')}: {format(transactionInfo.amount, 'financial')}</Text>
                    <Text>{t('Date')}: {transactionInfo.date}</Text>
                  </View>
                )}

                {result && (
                  <>
                    <View style={{ gap: 10 }}>
                      <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{t('AI Suggestion')}</Text>
                      <Text>
                        <span style={{ fontWeight: 600 }}>{t('Standard Category')}:</span> {getStandardName()}
                      </Text>
                      <Text>
                        <span style={{ fontWeight: 600 }}>{t('CSP Category')}:</span> {getCspName()}
                      </Text>
                      <Text>
                        <span style={{ fontWeight: 600 }}>{t('Confidence')}:</span> {Math.round(result.confidence * 100)}%
                      </Text>
                      <Text>
                        <span style={{ fontWeight: 600 }}>{t('Reasoning')}:</span> {result.reasoning}
                      </Text>
                      {result.suggest_rule && (
                        <Text style={{ color: 'var(--color-upcomingText)' }}>
                          ✨ {t('AI suggests creating a rule for this payee.')}
                        </Text>
                      )}
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                      <Button onPress={() => state.close()}>{t('Cancel')}</Button>
                      <Button
                        variant="primary"
                        onPress={async () => {
                          await onAccept();
                          state.close();
                        }}
                      >
                        {t('Accept & Save')}
                      </Button>
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        </>
      )}
    </Modal>
  );
}
