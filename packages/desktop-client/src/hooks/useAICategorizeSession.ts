import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { send } from '@actual-app/core/platform/client/connection';
import type { CategorizeResult } from '@actual-app/core/server/ai/categorize';
import { q } from '@actual-app/core/shared/query';
import type {
  CategoryEntity,
  CSPCategoryEntity,
  NewRuleEntity,
  TransactionEntity,
} from '@actual-app/core/types/models';

import { useAccounts } from '#hooks/useAccounts';
import { useCategories } from '#hooks/useCategories';
import { useCspCategories } from '#hooks/useCspCategories';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

export type UncategorizedTransaction = TransactionEntity & {
  'payee.name'?: string;
  'account.name'?: string;
  'account.offbudget'?: boolean;
};

const uncategorizedQuery = q('transactions')
  .filter({
    'account.offbudget': false,
    category: null,
    $or: [
      { 'payee.transfer_acct.offbudget': true, 'payee.transfer_acct': null },
    ],
  })
  .select(['*', 'payee.name', 'account.name', 'account.offbudget'])
  .serialize();

type UseAICategorizeSessionProps = {
  bulk: boolean;
  initialTransactionId?: string;
};

export function useAICategorizeSession({
  bulk,
  initialTransactionId,
}: UseAICategorizeSessionProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();

  const {
    data: { list: categories, grouped: categoryGroups } = {
      list: [],
      grouped: [],
    },
  } = useCategories();
  const {
    data: { list: cspCategories, grouped: defaultCspGroups } = {
      list: [],
      grouped: [],
    },
  } = useCspCategories();
  const { data: accounts = [] } = useAccounts();

  const [isLocalLoading, setIsLocalLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savingProgress, setSavingProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Queue state for bulk/single mode
  const [uncategorizedTransactions, setUncategorizedTransactions] = useState<
    UncategorizedTransaction[]
  >([]);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [initialTotal, setInitialTotal] = useState<number | null>(null);
  const [currentTxId, setCurrentTxId] = useState<string | null>(null);

  // Use a Ref to ensure async fetchPrediction updates selection states correctly for current transaction
  const currentTxIdRef = useRef<string | null>(null);

  // Predictions cache
  const [predictionCache, setPredictionCache] = useState<
    Record<string, CategorizeResult>
  >({});
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());

  // Form selections / states
  const [selectedStandardId, setSelectedStandardId] = useState<string | null>(
    null,
  );
  const [selectedCspId, setSelectedCspId] = useState<string | null>(null);
  const [createRule, setCreateRule] = useState<boolean>(false);
  const [applyToExisting, setApplyToExisting] = useState(true);
  const [conditionPayee, setConditionPayee] = useState(true);
  const [conditionAccount, setConditionAccount] = useState(false);
  const [ruleExpanded, setRuleExpanded] = useState(false);

  // Initialize transactions list
  useEffect(() => {
    async function init() {
      try {
        if (bulk) {
          const { data } = await send('query', uncategorizedQuery);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          const typedData = data as UncategorizedTransaction[];
          setUncategorizedTransactions(typedData || []);
          setInitialTotal((data || []).length);
          if (data && data.length > 0) {
            currentTxIdRef.current = data[0].id;
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
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const typedData = data as UncategorizedTransaction[];
            setUncategorizedTransactions(typedData);
            setInitialTotal(1);
            currentTxIdRef.current = initialTransactionId;
            setCurrentTxId(initialTransactionId);
          } else {
            setError(t('Transaction not found.'));
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLocalLoading(false);
      }
    }
    void init();
  }, [bulk, initialTransactionId, t]);

  const currentTx =
    uncategorizedTransactions.find(tx => tx.id === currentTxId) || null;
  const isAILoading = currentTx
    ? fetchingIds.has(currentTx.id) && !predictionCache[currentTx.id]
    : false;
  const result = currentTx ? predictionCache[currentTx.id] || null : null;

  // Modified category groups based on standard category suggestions
  const modifiedCategoryGroups = useMemo(() => {
    if (
      !result?.suggested_new_standard_category ||
      !result?.suggested_standard_category_group_id
    ) {
      return categoryGroups;
    }
    return categoryGroups.map(group => {
      if (group.id === result.suggested_standard_category_group_id) {
        const cats = group.categories || [];
        if (cats.some(c => c.id === 'new-standard-category-placeholder')) {
          return group;
        }
        return {
          ...group,
          categories: [
            ...cats,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            {
              id: 'new-standard-category-placeholder',
              name: `✨ ${result.suggested_new_standard_category} (New)`,
              group: group.id,
            } as unknown as CategoryEntity,
          ],
        };
      }
      return group;
    });
  }, [categoryGroups, result]);

  // Modified category groups based on CSP category suggestions
  const modifiedCspCategoryGroups = useMemo(() => {
    const groups = defaultCspGroups || [];
    if (
      !result?.suggested_new_csp_category ||
      !result?.suggested_csp_category_group_id
    ) {
      return groups;
    }
    return groups.map(group => {
      if (group.id === result.suggested_csp_category_group_id) {
        const cats = group.categories || [];
        if (cats.some(c => c.id === 'new-csp-category-placeholder')) {
          return group;
        }
        return {
          ...group,
          categories: [
            ...cats,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            {
              id: 'new-csp-category-placeholder',
              name: `✨ ${result.suggested_new_csp_category} (New)`,
              group: group.id,
            } as unknown as CSPCategoryEntity,
          ],
        };
      }
      return group;
    });
  }, [defaultCspGroups, result]);

  const PRELOAD_COUNT = 3;

  // Lookahead: find the next transactions where account and payee are different
  const lookaheadTxs = useMemo(() => {
    if (!bulk || !currentTx) return [];

    const diffPayeeAndAccount = uncategorizedTransactions.filter(
      tx =>
        tx.id !== currentTx.id &&
        !skippedIds.has(tx.id) &&
        tx.payee !== currentTx.payee &&
        tx.account !== currentTx.account,
    );

    if (diffPayeeAndAccount.length >= PRELOAD_COUNT) {
      return diffPayeeAndAccount.slice(0, PRELOAD_COUNT);
    }

    const remainingUncategorized = uncategorizedTransactions.filter(
      tx =>
        tx.id !== currentTx.id &&
        !skippedIds.has(tx.id) &&
        !diffPayeeAndAccount.some(d => d.id === tx.id),
    );

    return [...diffPayeeAndAccount, ...remainingUncategorized].slice(
      0,
      PRELOAD_COUNT,
    );
  }, [bulk, currentTx, uncategorizedTransactions, skippedIds, PRELOAD_COUNT]);

  // Helper to transition selection form states synchronously when changing active transaction
  const advanceToTransaction = (
    txId: string | null,
    currentPredictions = predictionCache,
  ) => {
    currentTxIdRef.current = txId;
    setCurrentTxId(txId);

    if (txId && currentPredictions[txId]) {
      const res = currentPredictions[txId];
      if (res.suggested_new_standard_category) {
        setSelectedStandardId('new-standard-category-placeholder');
      } else {
        setSelectedStandardId(res.standard_category_id ?? null);
      }

      if (res.suggested_new_csp_category) {
        setSelectedCspId('new-csp-category-placeholder');
      } else {
        setSelectedCspId(res.csp_category_id ?? null);
      }

      setCreateRule(res.confidence === 'certain');
      setConditionPayee(res.suggest_rule_condition !== 'account');
      setConditionAccount(res.suggest_rule_condition !== 'payee');
      setRuleExpanded(false);
    } else {
      setSelectedStandardId(null);
      setSelectedCspId(null);
      setCreateRule(false);
      setConditionPayee(true);
      setConditionAccount(false);
      setRuleExpanded(false);
    }
  };

  const fetchPrediction = async (
    txId: string,
    payeeName: string | undefined,
  ) => {
    if (predictionCache[txId] || fetchingIds.has(txId)) return;
    setFetchingIds(prev => {
      const next = new Set(prev);
      next.add(txId);
      return next;
    });
    try {
      const res = await send('ai-categorize-transaction', {
        transactionId: txId,
        payeeName,
      });
      setPredictionCache(prev => {
        const nextCache = { ...prev, [txId]: res };
        return nextCache;
      });

      // Synchronize state if the prediction fetched was for the current active transaction
      if (txId === currentTxIdRef.current) {
        if (res.suggested_new_standard_category) {
          setSelectedStandardId('new-standard-category-placeholder');
        } else {
          setSelectedStandardId(res.standard_category_id ?? null);
        }

        if (res.suggested_new_csp_category) {
          setSelectedCspId('new-csp-category-placeholder');
        } else {
          setSelectedCspId(res.csp_category_id ?? null);
        }

        setCreateRule(res.confidence === 'certain');
        setConditionPayee(res.suggest_rule_condition !== 'account');
        setConditionAccount(res.suggest_rule_condition !== 'payee');
        setRuleExpanded(false);
      }
    } catch (err) {
      if (txId === currentTxIdRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setFetchingIds(prev => {
        const next = new Set(prev);
        next.delete(txId);
        return next;
      });
    }
  };

  // Fetch prediction for the current active transaction
  useEffect(() => {
    if (currentTx) {
      void fetchPrediction(currentTx.id, currentTx['payee.name'] ?? undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTx?.id]);

  // Pre-load predictions for the next two lookahead transactions in the background
  useEffect(() => {
    lookaheadTxs.forEach(tx => {
      void fetchPrediction(tx.id, tx['payee.name'] ?? undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookaheadTxs]);

  const onAccept = async () => {
    if (!currentTx || !result) return;
    setIsSaving(true);
    try {
      const isAcceptingSuggestedStandard =
        selectedStandardId === 'new-standard-category-placeholder';
      const isAcceptingSuggestedCsp =
        selectedCspId === 'new-csp-category-placeholder';

      const { standard_category_id, csp_category_id } = await send(
        'ai-apply-categorization',
        {
          standard_category_id: isAcceptingSuggestedStandard
            ? null
            : selectedStandardId,
          csp_category_id: isAcceptingSuggestedCsp ? null : selectedCspId,
          is_income: currentTx.amount > 0,
          suggested_new_standard_category:
            isAcceptingSuggestedStandard &&
            result.suggested_new_standard_category
              ? {
                  name: result.suggested_new_standard_category,
                  groupId: result.suggested_standard_category_group_id!,
                }
              : null,
          suggested_new_csp_category:
            isAcceptingSuggestedCsp && result.suggested_new_csp_category
              ? {
                  name: result.suggested_new_csp_category,
                  groupId: result.suggested_csp_category_group_id!,
                }
              : null,
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const updates = { id: currentTx.id } as unknown as TransactionEntity;
      if (standard_category_id !== undefined) {
        updates.category = standard_category_id ?? undefined;
      }
      if (csp_category_id !== undefined) {
        updates.csp_category = csp_category_id ?? undefined;
      }

      await send('transaction-update', updates);

      if (createRule && (conditionPayee || conditionAccount)) {
        await send(
          'rule-add',
          buildRule(
            selectedStandardId === 'new-standard-category-placeholder'
              ? standard_category_id
              : selectedStandardId,
            selectedCspId === 'new-csp-category-placeholder'
              ? csp_category_id
              : selectedCspId,
          ),
        );

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
              if (standard_category_id) {
                txUpdates.category = standard_category_id ?? undefined;
              }
              if (csp_category_id) {
                txUpdates.csp_category = csp_category_id ?? undefined;
              }
              await send('transaction-update', txUpdates);
              setSavingProgress({ current: i + 1, total: existing.length });
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
      setSavingProgress(null);
    }
  };

  const handleAcceptAndNext = async (modalClose: () => void) => {
    await onAccept();
    if (bulk) {
      const { data } = await send('query', uncategorizedQuery);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const typedData = data as UncategorizedTransaction[];
      setUncategorizedTransactions(typedData || []);
      const nextTx = (typedData || []).find(
        (tx: UncategorizedTransaction) => !skippedIds.has(tx.id),
      );
      if (nextTx) {
        advanceToTransaction(nextTx.id);
      } else {
        advanceToTransaction(null);
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

    const nextTx = uncategorizedTransactions.find(
      tx => tx.id !== currentTx.id && !nextSkipped.has(tx.id),
    );
    if (nextTx) {
      advanceToTransaction(nextTx.id);
    } else {
      advanceToTransaction(null);
    }
  };

  function buildRule(
    standardId: string | null = selectedStandardId,
    cspId: string | null = selectedCspId,
  ): NewRuleEntity {
    const actions: NewRuleEntity['actions'] = [];
    if (standardId && standardId !== 'new-standard-category-placeholder') {
      actions.push({
        op: 'set',
        field: 'category',
        value: standardId,
        type: 'id',
      });
    }
    if (cspId && cspId !== 'new-csp-category-placeholder') {
      actions.push({
        op: 'set',
        field: 'csp_category',
        value: cspId,
        type: 'id',
      });
    }
    const conditions: NewRuleEntity['conditions'] = [];
    if (conditionPayee && currentTx?.payee) {
      conditions.push({
        field: 'payee',
        op: 'is',
        value: currentTx.payee,
        type: 'id',
      });
    }
    if (conditionAccount && currentTx?.account) {
      conditions.push({
        field: 'account',
        op: 'is',
        value: currentTx.account,
        type: 'id',
      });
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

  const remainingCount = uncategorizedTransactions.filter(
    tx => !skippedIds.has(tx.id),
  ).length;
  const currentProgress = initialTotal ? initialTotal - remainingCount + 1 : 1;
  const showSuccess = !isLocalLoading && remainingCount === 0;

  const preloadStatus = useMemo(() => {
    return lookaheadTxs.map(tx => {
      if (predictionCache[tx.id]) return 'loaded';
      if (fetchingIds.has(tx.id)) return 'loading';
      return 'pending';
    });
  }, [lookaheadTxs, predictionCache, fetchingIds]);

  return {
    preloadStatus,
    isLocalLoading,
    isSaving,
    savingProgress,
    error,
    currentTx,
    result,
    isAILoading,
    selectedStandardId,
    setSelectedStandardId,
    selectedCspId,
    setSelectedCspId,
    createRule,
    setCreateRule,
    applyToExisting,
    setApplyToExisting,
    conditionPayee,
    setConditionPayee,
    conditionAccount,
    setConditionAccount,
    ruleExpanded,
    setRuleExpanded,
    modifiedCategoryGroups,
    modifiedCspCategoryGroups,
    accounts,
    categories,
    cspCategories,
    initialTotal,
    remainingCount,
    currentProgress,
    showSuccess,
    skippedIds,
    handleAcceptAndNext,
    handleSkip,
    openRuleEditor,
  };
}
