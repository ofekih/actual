import React, { useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgExpandArrow } from '@actual-app/components/icons/v0';
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
import { useAccounts } from '#hooks/useAccounts';
import { useCategories } from '#hooks/useCategories';
import { useCspCategories } from '#hooks/useCspCategories';
import { useFormat } from '#hooks/useFormat';
import { pushModal } from '#modals/modalsSlice';
import type { Modal as ModalType } from '#modals/modalsSlice';
import { useDispatch } from '#redux';
import type { NewRuleEntity, TransactionEntity } from '@actual-app/core/types/models';
import { AnimatedLoading } from '@actual-app/components/icons/AnimatedLoading';
import { css, keyframes } from '@emotion/css';

type AICategorizeReviewModalProps = Extract<
  ModalType,
  { name: 'ai-categorize-review' }
>['options'];

const shimmer = keyframes`
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
`;

const skeletonStyle = css`
  background: linear-gradient(90deg, ${theme.tableBorder} 25%, ${theme.tableBackground} 37%, ${theme.tableBorder} 63%);
  background-size: 200% 100%;
  animation: ${shimmer} 1.4s ease infinite;
`;

export function AICategorizeReviewModal({
  transactionId,
}: AICategorizeReviewModalProps) {
  const { t } = useTranslation();
  const { data: { list: categories, grouped: categoryGroups } = { list: [], grouped: [] } } = useCategories();
  const { data: { list: cspCategories } = { list: [] } } = useCspCategories();
  const format = useFormat();
  const dispatch = useDispatch();
  const { data: accounts = [] } = useAccounts();

  const [isLocalLoading, setIsLocalLoading] = useState(true);
  const [isAILoading, setIsAILoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savingProgress, setSavingProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CategorizeResult | null>(null);
  const [transactionInfo, setTransactionInfo] = useState<any>(null);

  const [selectedStandardId, setSelectedStandardId] = useState<string | null>(null);
  const [selectedCspId, setSelectedCspId] = useState<string | null>(null);
  const [createRule, setCreateRule] = useState<boolean>(false);
  const [applyToExisting, setApplyToExisting] = useState(true);
  const [conditionPayee, setConditionPayee] = useState(true);
  const [conditionAccount, setConditionAccount] = useState(false);
  const [ruleExpanded, setRuleExpanded] = useState(false);

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
          setIsLocalLoading(false);
          setIsAILoading(true);
          const res = await send('ai-categorize-transaction', {
            transactionId,
            payeeName: data[0]['payee.name'] ?? undefined,
          });
          setResult(res);
          setSelectedStandardId(res.standard_category_id ?? null);
          setSelectedCspId(res.csp_category_id ?? null);
          setCreateRule(res.suggest_rule);
          setConditionPayee(res.suggest_rule_condition !== 'account');
          setConditionAccount(res.suggest_rule_condition !== 'payee');
        } else {
          setError(t('Transaction not found.'));
        }
      } catch (err: any) {
        setError(err.message || String(err));
      } finally {
        setIsLocalLoading(false);
        setIsAILoading(false);
      }
    }
    fetchCategorization();
  }, [transactionId, t]);

  const onAccept = async () => {
    if (!result) return;
    setIsSaving(true);
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

      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const updates = { id: transactionId } as unknown as TransactionEntity;
      if (standard_category_id !== undefined)
        updates.category = standard_category_id ?? undefined;
      if (csp_category_id !== undefined) updates.csp_category = csp_category_id ?? undefined;

      await send('transaction-update', updates);

      // Create a rule if checkbox is checked
      if (createRule && (conditionPayee || conditionAccount)) {
        await send('rule-add', buildRule());

        // Apply to all existing uncategorized transactions with the same payee
        if (applyToExisting) {
          const filters: Record<string, unknown> = { is_parent: false };
          if (conditionPayee) filters.payee = transactionInfo.payee;
          if (conditionAccount) filters.account = transactionInfo.account;
          if (standard_category_id) filters.category = null;
          if (csp_category_id) filters.csp_category = null;
          const { data: existing } = await send(
            'query',
            q('transactions').filter(filters).select('id').serialize(),
          );
          if (existing && existing.length > 0) {
            setSavingProgress({ current: 0, total: existing.length });
            for (let i = 0; i < existing.length; i++) {
              const tx = existing[i];
              // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
              const txUpdates = { id: tx.id } as unknown as TransactionEntity;
              if (standard_category_id) txUpdates.category = standard_category_id ?? undefined;
              if (csp_category_id) txUpdates.csp_category = csp_category_id ?? undefined;
              await send('transaction-update', txUpdates);
              setSavingProgress({ current: i + 1, total: existing.length });
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setIsSaving(false);
      setSavingProgress(null);
    }
  };

  function buildRule(): NewRuleEntity {
    const actions: NewRuleEntity['actions'] = [];
    if (selectedStandardId) {
      actions.push({ op: 'set', field: 'category', value: selectedStandardId, type: 'id' });
    }
    if (selectedCspId) {
      actions.push({ op: 'set', field: 'csp_category', value: selectedCspId, type: 'id' });
    }
    const conditions: NewRuleEntity['conditions'] = [];
    if (conditionPayee && transactionInfo.payee) {
      conditions.push({ field: 'payee', op: 'is', value: transactionInfo.payee, type: 'id' });
    }
    if (conditionAccount && transactionInfo.account) {
      conditions.push({ field: 'account', op: 'is', value: transactionInfo.account, type: 'id' });
    }
    return { stage: null, conditionsOp: 'and', conditions, actions };
  }

  function openRuleEditor() {
    const rule = buildRule();
    dispatch(
      pushModal({
        modal: {
          name: 'edit-rule',
          options: { rule },
        },
      }),
    );
  }

  return (
    <Modal name="ai-categorize-review" isLoading={isLocalLoading}>
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
          <View style={{ gap: 15, padding: 15, minWidth: 650, position: 'relative' }}>
            {error ? (
              <Text style={{ color: theme.errorText }}>{error}</Text>
            ) : (
              <>
                {transactionInfo && (result || isAILoading) && (
                  <View style={{ gap: 15 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        backgroundColor: theme.tableBackground,
                        border: `1px solid ${theme.tableBorder}`,
                        borderRadius: 4,
                        borderLeft: `4px solid ${isAILoading
                          ? theme.tableBorder
                          : result?.confidence === 'high'
                            ? theme.noticeTextLight
                            : result?.confidence === 'medium'
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
                        {isAILoading ? (
                          <View className={skeletonStyle} style={{ height: 28, borderRadius: 4 }} />
                        ) : (
                          <SheetNameProvider name={monthUtils.sheetForMonth(monthUtils.monthFromDate(transactionInfo.date))}>
                            <CategoryAutocomplete
                              categoryGroups={categoryGroups}
                              value={selectedStandardId}
                              onSelect={(id) => setSelectedStandardId(id)}
                              showSplitOption={false}
                              inputProps={{ placeholder: t('Select category...') }}
                            />
                          </SheetNameProvider>
                        )}
                      </View>

                      <View style={{ flex: 2, minWidth: 150 }}>
                        <Text style={{ color: theme.pageTextLight, fontSize: 12, marginBottom: 2 }}>{t('CSP Category')}</Text>
                        {isAILoading ? (
                          <View className={skeletonStyle} style={{ height: 28, borderRadius: 4 }} />
                        ) : (
                          <Select
                            options={[['', t('Uncategorized')], ...cspCategories.map(c => [c.id, c.name] as [string, string])]}
                            value={selectedCspId || ''}
                            onChange={(val) => setSelectedCspId(val === '' ? null : val)}
                          />
                        )}
                      </View>
                    </View>

                    {isAILoading ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 13, color: theme.pageTextLight, fontWeight: 600 }}>{t('Reasoning')}:</Text>
                        <View className={skeletonStyle} style={{ flex: 1, height: 16, borderRadius: 4 }} />
                      </View>
                    ) : (
                      <Text style={{ fontSize: 13, color: theme.pageTextLight, fontStyle: 'italic' }}>
                        <span style={{ fontWeight: 600 }}>{t('Reasoning')}:</span> {result?.reasoning}
                      </Text>
                    )}

                    {isAILoading ? (
                      <View className={skeletonStyle} style={{ height: 44, borderRadius: 4 }} />
                    ) : (
                      result?.suggest_rule && (
                        <View style={{
                          backgroundColor: theme.pillBackgroundSelected,
                          borderRadius: 4,
                          overflow: 'hidden',
                        }}>
                          <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: 10,
                            gap: 10,
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                            onClick={() => setRuleExpanded(!ruleExpanded)}
                          >
                            <Checkbox
                              id="create-rule"
                              checked={createRule}
                              onChange={(e) => {
                                e.stopPropagation();
                                setCreateRule(e.target.checked);
                              }}
                            />
                            <View style={{ flex: 1 }}>
                              <label htmlFor="create-rule" style={{ fontWeight: 600, userSelect: 'none', cursor: 'pointer' }}>
                                ✨ {t('Create a rule for this payee')}
                              </label>
                              <Text style={{ fontSize: 12, color: theme.pageTextLight, marginTop: 2 }}>
                                {t('Automatically categorize future transactions for')} "{transactionInfo['payee.name']}"
                              </Text>
                            </View>
                            <SvgExpandArrow
                              style={{
                                width: 10,
                                height: 10,
                                color: theme.pageTextLight,
                                transform: ruleExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                                transition: 'transform 0.15s ease',
                                flexShrink: 0,
                              }}
                            />
                          </View>

                          {ruleExpanded && (
                            <View style={{
                              padding: '0 15px 15px 15px',
                              gap: 12,
                              borderTop: `1px solid ${theme.tableBorder}`,
                              paddingTop: 12,
                            }}>
                              <View>
                                <Text style={{ fontWeight: 600, fontSize: 12, color: theme.pageTextLight, marginBottom: 6 }}>
                                  {t('Conditions')}
                                </Text>
                                <View style={{
                                  backgroundColor: theme.tableBackground,
                                  border: `1px solid ${theme.tableBorder}`,
                                  borderRadius: 4,
                                  padding: '8px 12px',
                                  gap: 6,
                                }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Checkbox
                                      id="cond-payee"
                                      checked={conditionPayee}
                                      onChange={(e) => setConditionPayee(e.target.checked)}
                                    />
                                    <label htmlFor="cond-payee" style={{ fontSize: 13, userSelect: 'none', cursor: 'pointer' }}>
                                      {t('payee')} {t('is')} "<span style={{ fontStyle: 'italic' }}>{transactionInfo['payee.name']}</span>"
                                    </label>
                                  </View>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Checkbox
                                      id="cond-account"
                                      checked={conditionAccount}
                                      onChange={(e) => setConditionAccount(e.target.checked)}
                                    />
                                    <label htmlFor="cond-account" style={{ fontSize: 13, userSelect: 'none', cursor: 'pointer' }}>
                                      {t('account')} {t('is')} "<span style={{ fontStyle: 'italic' }}>{accounts.find(a => a.id === transactionInfo.account)?.name ?? transactionInfo.account}</span>"
                                    </label>
                                  </View>
                                </View>
                              </View>

                              <View>
                                <Text style={{ fontWeight: 600, fontSize: 12, color: theme.pageTextLight, marginBottom: 6 }}>
                                  {t('Actions')}
                                </Text>
                                <View style={{
                                  backgroundColor: theme.tableBackground,
                                  border: `1px solid ${theme.tableBorder}`,
                                  borderRadius: 4,
                                  padding: '8px 12px',
                                  gap: 4,
                                }}>
                                  {selectedStandardId && (() => {
                                    const cat = categories.find(c => c.id === selectedStandardId);
                                    return (
                                      <Text style={{ fontSize: 13 }}>
                                        {t('Set')} <span style={{ fontWeight: 600 }}>{t('category')}</span> {t('to')} "<span style={{ fontStyle: 'italic' }}>{cat?.name ?? selectedStandardId}</span>"
                                      </Text>
                                    );
                                  })()}
                                  {selectedCspId && (() => {
                                    const cat = cspCategories.find(c => c.id === selectedCspId);
                                    return (
                                      <Text style={{ fontSize: 13 }}>
                                        {t('Set')} <span style={{ fontWeight: 600 }}>{t('CSP category')}</span> {t('to')} "<span style={{ fontStyle: 'italic' }}>{cat?.name ?? selectedCspId}</span>"
                                      </Text>
                                    );
                                  })()}
                                  {!selectedStandardId && !selectedCspId && (
                                    <Text style={{ fontSize: 13, color: theme.pageTextLight, fontStyle: 'italic' }}>
                                      {t('No actions — select at least one category above')}
                                    </Text>
                                  )}
                                </View>
                              </View>

                              <Button
                                variant="bare"
                                style={{ alignSelf: 'flex-start', fontSize: 12 }}
                                onPress={openRuleEditor}
                              >
                                {t('Edit Rule...')}
                              </Button>

                              {createRule && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Checkbox
                                    id="apply-to-existing"
                                    checked={applyToExisting}
                                    onChange={(e) => setApplyToExisting(e.target.checked)}
                                  />
                                  <label htmlFor="apply-to-existing" style={{ fontSize: 12, userSelect: 'none', cursor: 'pointer' }}>
                                    {t('Also apply to existing uncategorized transactions matching these conditions')}
                                  </label>
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      )
                    )}

                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                      <Button onPress={() => state.close()}>{t('Cancel')}</Button>
                      <Button variant="primary" isDisabled={isAILoading} onPress={async () => {
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

            {isSaving && (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: theme.modalBackground,
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                  gap: 15,
                  padding: 20,
                  borderRadius: 6,
                }}
              >
                <AnimatedLoading style={{ width: 30, height: 30 }} color={theme.pageText} />
                <Text style={{ fontWeight: 600, fontSize: 16 }}>
                  {savingProgress ? t('Applying updates to existing transactions...') : t('Saving changes...')}
                </Text>
                {savingProgress && (
                  <View style={{ width: '80%', alignItems: 'center', gap: 8 }}>
                    <View
                      style={{
                        width: '100%',
                        height: 8,
                        backgroundColor: theme.tableBorder,
                        borderRadius: 4,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          width: `${(savingProgress.current / savingProgress.total) * 100}%`,
                          height: '100%',
                          backgroundColor: theme.buttonPrimaryBackground,
                          transition: 'width 0.1s ease',
                        }}
                      />
                    </View>
                    <Text style={{ fontSize: 12, color: theme.pageTextLight }}>
                      {t('Updated {{current}} of {{total}} transactions', {
                        current: savingProgress.current,
                        total: savingProgress.total,
                      })}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </>
      )}
    </Modal>
  );
}
