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
import { CspCategoryAutocomplete } from '#components/autocomplete/CspCategoryAutocomplete';
import { Select } from '@actual-app/components/select';
import { Tooltip } from '@actual-app/components/tooltip';
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

const uncategorizedQuery = q('transactions')
  .filter({
    'account.offbudget': false,
    category: null,
    $or: [{ 'payee.transfer_acct.offbudget': true, 'payee.transfer_acct': null }],
  })
  .select(['*', 'payee.name', 'account.name', 'account.offbudget'])
  .serialize();

export function AICategorizeReviewModal(props: AICategorizeReviewModalProps) {
  const { t } = useTranslation();
  const { data: { list: categories, grouped: categoryGroups } = { list: [], grouped: [] } } = useCategories();
  const { data: { list: cspCategories } = { list: [] } } = useCspCategories();
  const format = useFormat();
  const dispatch = useDispatch();
  const { data: accounts = [] } = useAccounts();

  const bulk = 'bulk' in props ? props.bulk : false;
  const initialTransactionId = 'transactionId' in props ? props.transactionId : undefined;

  const [isLocalLoading, setIsLocalLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savingProgress, setSavingProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Queue state for bulk/single mode
  const [uncategorizedTransactions, setUncategorizedTransactions] = useState<any[]>([]);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [initialTotal, setInitialTotal] = useState<number | null>(null);
  const [currentTxId, setCurrentTxId] = useState<string | null>(null);

  // Predictions cache
  const [predictionCache, setPredictionCache] = useState<Record<string, CategorizeResult>>({});
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());

  const [selectedStandardId, setSelectedStandardId] = useState<string | null>(null);
  const [selectedCspId, setSelectedCspId] = useState<string | null>(null);
  const [createRule, setCreateRule] = useState<boolean>(false);
  const [applyToExisting, setApplyToExisting] = useState(true);
  const [conditionPayee, setConditionPayee] = useState(true);
  const [conditionAccount, setConditionAccount] = useState(false);
  const [ruleExpanded, setRuleExpanded] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        if (bulk) {
          const { data } = await send('query', uncategorizedQuery);
          setUncategorizedTransactions(data || []);
          setInitialTotal((data || []).length);
          if (data && data.length > 0) {
            setCurrentTxId(data[0].id);
          }
        } else if (initialTransactionId) {
          const { data } = await send(
            'query',
            q('transactions')
              .filter({ id: initialTransactionId })
              .select(['*', 'payee.name', 'account.name', 'account.offbudget'])
              .serialize(),
          );
          if (data && data.length > 0) {
            setUncategorizedTransactions(data);
            setInitialTotal(1);
            setCurrentTxId(initialTransactionId);
          } else {
            setError(t('Transaction not found.'));
          }
        }
      } catch (err: any) {
        setError(err.message || String(err));
      } finally {
        setIsLocalLoading(false);
      }
    }
    init();
  }, [bulk, initialTransactionId, t]);

  const currentTx = uncategorizedTransactions.find(tx => tx.id === currentTxId) || null;
  const isAILoading = currentTx ? fetchingIds.has(currentTx.id) && !predictionCache[currentTx.id] : false;
  const result = currentTx ? predictionCache[currentTx.id] || null : null;

  const lookaheadTx = React.useMemo(() => {
    if (!bulk || !currentTx) return null;
    const diffPayeeAndAccount = uncategorizedTransactions.find(
      tx => tx.id !== currentTx.id && !skippedIds.has(tx.id) && tx.payee !== currentTx.payee && tx.account !== currentTx.account,
    );
    if (diffPayeeAndAccount) return diffPayeeAndAccount;
    return uncategorizedTransactions.find(tx => tx.id !== currentTx.id && !skippedIds.has(tx.id)) || null;
  }, [bulk, currentTx, uncategorizedTransactions, skippedIds]);

  const fetchPrediction = async (txId: string, payeeName: string | undefined) => {
    if (predictionCache[txId] || fetchingIds.has(txId)) return;
    setFetchingIds(prev => {
      const next = new Set(prev);
      next.add(txId);
      return next;
    });
    try {
      const res = await send('ai-categorize-transaction', { transactionId: txId, payeeName });
      setPredictionCache(prev => ({ ...prev, [txId]: res }));
    } catch (err: any) {
      if (txId === currentTxId) {
        setError(err.message || String(err));
      }
    } finally {
      setFetchingIds(prev => {
        const next = new Set(prev);
        next.delete(txId);
        return next;
      });
    }
  };

  useEffect(() => {
    if (currentTx) {
      fetchPrediction(currentTx.id, currentTx['payee.name'] ?? undefined);
    }
  }, [currentTx?.id]);

  useEffect(() => {
    if (lookaheadTx) {
      fetchPrediction(lookaheadTx.id, lookaheadTx['payee.name'] ?? undefined);
    }
  }, [lookaheadTx?.id]);

  useEffect(() => {
    if (result) {
      setSelectedStandardId(result.standard_category_id ?? null);
      setSelectedCspId(result.csp_category_id ?? null);
      setCreateRule(result.confidence === 'certain');
      setConditionPayee(result.suggest_rule_condition !== 'account');
      setConditionAccount(result.suggest_rule_condition !== 'payee');
      setRuleExpanded(false);
    } else {
      setSelectedStandardId(null);
      setSelectedCspId(null);
      setCreateRule(false);
      setConditionPayee(true);
      setConditionAccount(false);
      setRuleExpanded(false);
    }
  }, [currentTxId, result]);

  const onAccept = async () => {
    if (!currentTx || !result) return;
    setIsSaving(true);
    try {
      const { standard_category_id, csp_category_id } = await send(
        'ai-apply-categorization',
        {
          standard_category_id: selectedStandardId,
          csp_category_id: selectedCspId,
          is_income: currentTx.amount > 0,
          suggested_new_standard_category: result.suggested_new_standard_category
            ? { name: result.suggested_new_standard_category, groupId: result.suggested_standard_category_group_id! }
            : null,
          suggested_new_csp_category: result.suggested_new_csp_category
            ? { name: result.suggested_new_csp_category, groupId: result.suggested_csp_category_group_id! }
            : null,
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const updates = { id: currentTx.id } as unknown as TransactionEntity;
      if (standard_category_id !== undefined) updates.category = standard_category_id ?? undefined;
      if (csp_category_id !== undefined) updates.csp_category = csp_category_id ?? undefined;

      await send('transaction-update', updates);

      if (createRule && (conditionPayee || conditionAccount)) {
        await send('rule-add', buildRule());

        if (applyToExisting) {
          const filters: Record<string, unknown> = { is_parent: false };
          if (conditionPayee) filters.payee = currentTx.payee;
          if (conditionAccount) filters.account = currentTx.account;
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

  const handleAcceptAndNext = async (modalClose: () => void) => {
    await onAccept();
    if (bulk) {
      const { data } = await send('query', uncategorizedQuery);
      setUncategorizedTransactions(data || []);
      const nextTx = (data || []).find((tx: any) => !skippedIds.has(tx.id));
      if (nextTx) {
        setCurrentTxId(nextTx.id);
      } else {
        setCurrentTxId(null);
      }
    } else {
      modalClose();
    }
  };

  const handleSkip = () => {
    if (!currentTx) return;
    const nextSkipped = new Set(skippedIds);
    nextSkipped.add(currentTx.id);
    setSkippedIds(nextSkipped);

    const nextTx = uncategorizedTransactions.find(tx => tx.id !== currentTx.id && !nextSkipped.has(tx.id));
    if (nextTx) {
      setCurrentTxId(nextTx.id);
    } else {
      setCurrentTxId(null);
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
    if (conditionPayee && currentTx?.payee) {
      conditions.push({ field: 'payee', op: 'is', value: currentTx.payee, type: 'id' });
    }
    if (conditionAccount && currentTx?.account) {
      conditions.push({ field: 'account', op: 'is', value: currentTx.account, type: 'id' });
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

  const remainingCount = uncategorizedTransactions.filter(tx => !skippedIds.has(tx.id)).length;
  const currentProgress = initialTotal ? initialTotal - remainingCount + 1 : 1;
  const showSuccess = !isLocalLoading && remainingCount === 0;

  let modalTitle = t('AI Categorization Review');
  if (bulk && initialTotal && initialTotal > 0 && remainingCount > 0) {
    modalTitle = t('AI Categorize All ({{current}} of {{total}})', { current: currentProgress, total: initialTotal });
  }

  return (
    <Modal name="ai-categorize-review" isLoading={isLocalLoading}>
      {({ state }) => (
        <>
          <ModalHeader
            title={<ModalTitle title={modalTitle} shrinkOnOverflow />}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ gap: 15, padding: 15, minWidth: 1000, width: 1000, position: 'relative' }}>
            {error ? (
              <Text style={{ color: theme.errorText }}>{error}</Text>
            ) : showSuccess ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', padding: '30px 10px', gap: 15 }}>
                <Text style={{ fontSize: 40 }}>🎉</Text>
                <Text style={{ fontSize: 18, fontWeight: 600 }}>
                  {initialTotal === 0 ? t('No uncategorized transactions to process!') : t('All uncategorized transactions processed!')}
                </Text>
                {initialTotal && initialTotal > 0 && skippedIds.size > 0 && (
                  <Text style={{ color: theme.pageTextLight, fontSize: 14 }}>
                    {t('Processed {{total}} transactions ({{skipped}} skipped).', { total: initialTotal, skipped: skippedIds.size })}
                  </Text>
                )}
                <Button variant="primary" style={{ marginTop: 10 }} onPress={() => state.close()}>{t('Close')}</Button>
              </View>
            ) : currentTx && (result || isAILoading) ? (
              <>
                {bulk && initialTotal && initialTotal > 0 && (
                  <View style={{ width: '100%', height: 4, backgroundColor: theme.tableBorder, borderRadius: 2, overflow: 'hidden', marginBottom: 5 }}>
                    <View style={{ width: `${((currentProgress - 1) / initialTotal) * 100}%`, height: '100%', backgroundColor: theme.formInputTextHighlight, transition: 'width 0.3s ease' }} />
                  </View>
                )}
                <View style={{ gap: 15 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      backgroundColor: theme.tableBackground,
                      border: `1px solid ${theme.tableBorder}`,
                      borderRadius: 4,
                      borderLeft: `4px solid ${isAILoading
                        ? theme.tableBorder
                        : result?.confidence === 'certain'
                          ? theme.noticeTextLight
                          : result?.confidence === 'confident'
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
                      <Text>{currentTx.date}</Text>
                    </View>

                    <View style={{ flex: 2, minWidth: 120 }}>
                      <Text style={{ color: theme.pageTextLight, fontSize: 12, marginBottom: 2 }}>{t('Payee')}</Text>
                      <Tooltip
                        content={currentTx['payee.name'] || t('Unknown')}
                        triggerProps={{ isDisabled: !currentTx['payee.name'] }}
                      >
                        <Text style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentTx['payee.name'] || t('Unknown')}</Text>
                      </Tooltip>
                    </View>

                    <View style={{ flex: 2, minWidth: 120 }}>
                      <Text style={{ color: theme.pageTextLight, fontSize: 12, marginBottom: 2 }}>{t('Account')}</Text>
                      <Tooltip
                        content={currentTx['account.name'] || ''}
                        triggerProps={{ isDisabled: !currentTx['account.name'] }}
                      >
                        <Text style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentTx['account.name'] || '—'}</Text>
                      </Tooltip>
                    </View>

                    {currentTx.notes ? (
                      <View style={{ flex: 2, minWidth: 100 }}>
                        <Text style={{ color: theme.pageTextLight, fontSize: 12, marginBottom: 2 }}>{t('Notes')}</Text>
                        <Tooltip content={currentTx.notes}>
                          <Text style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: theme.pageTextLight, fontStyle: 'italic' }}>{currentTx.notes}</Text>
                        </Tooltip>
                      </View>
                    ) : null}

                    <View style={{ flex: 1, minWidth: 80, alignItems: 'flex-end' }}>
                      <Text style={{ color: theme.pageTextLight, fontSize: 12, marginBottom: 2 }}>{t('Amount')}</Text>
                      <Text>{format(currentTx.amount, 'financial')}</Text>
                    </View>

                    <View style={{ width: 1, height: 30, backgroundColor: theme.tableBorder, marginHorizontal: 5 }} />

                    <View style={{ flex: 2, minWidth: 150 }}>
                      <Text style={{ color: theme.pageTextLight, fontSize: 12, marginBottom: 2 }}>{t('Category')}</Text>
                      {isAILoading ? (
                        <View className={skeletonStyle} style={{ height: 28, borderRadius: 4 }} />
                      ) : (
                        <SheetNameProvider name={monthUtils.sheetForMonth(monthUtils.monthFromDate(currentTx.date))}>
                          <CategoryAutocomplete
                            categoryGroups={categoryGroups}
                            value={selectedStandardId}
                            onSelect={(id) => setSelectedStandardId(id)}
                            showSplitOption={false}
                            updateOnValueChange={true}
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
                        <CspCategoryAutocomplete
                          value={selectedCspId}
                          onSelect={id => setSelectedCspId(id)}
                          updateOnValueChange={true}
                          inputProps={{ placeholder: t('Select CSP category...') }}
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
                    <Text style={{
                      fontSize: 13,
                      color: theme.pageTextLight,
                      fontStyle: 'italic',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                    }}>
                      <span style={{ fontWeight: 600 }}>{t('Reasoning')}:</span> {result?.reasoning}
                    </Text>
                  )}

                  {isAILoading ? (
                    <View className={skeletonStyle} style={{ height: 44, borderRadius: 4 }} />
                  ) : (
                    result && (
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
                              {t('Automatically categorize future transactions for')} "{currentTx['payee.name']}"
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
                                    {t('payee')} {t('is')} "<span style={{ fontStyle: 'italic' }}>{currentTx['payee.name']}</span>"
                                  </label>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Checkbox
                                    id="cond-account"
                                    checked={conditionAccount}
                                    onChange={(e) => setConditionAccount(e.target.checked)}
                                  />
                                  <label htmlFor="cond-account" style={{ fontSize: 13, userSelect: 'none', cursor: 'pointer' }}>
                                    {t('account')} {t('is')} "<span style={{ fontStyle: 'italic' }}>{accounts.find(a => a.id === currentTx.account)?.name ?? currentTx.account}</span>"
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
                    <Button onPress={() => state.close()}>{bulk ? t('Stop / Close') : t('Cancel')}</Button>
                    {bulk && (
                      <Button variant="normal" onPress={handleSkip}>{t('Skip')}</Button>
                    )}
                    <Button variant="primary" isDisabled={isAILoading} onPress={() => handleAcceptAndNext(state.close)}>
                      {t('Accept & Save')}
                    </Button>
                  </View>
                </View>
              </>
            ) : null}

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
