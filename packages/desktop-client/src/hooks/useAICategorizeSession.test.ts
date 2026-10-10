import { send } from '@actual-app/core/platform/client/connection';
import type { CategorizeResult } from '@actual-app/core/server/ai/categorize';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAICategorizeSession } from './useAICategorizeSession';

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn(),
}));

vi.mock('#hooks/useCategories', () => ({
  useCategories: () => ({
    data: {
      list: [
        { id: 'cat-pharmacy', name: 'Pharmacy', group: 'grp-health' },
        { id: 'cat-merch', name: 'General Merchandise', group: 'grp-shopping' },
      ],
      grouped: [
        {
          id: 'grp-health',
          name: 'Health & Fitness',
          categories: [
            { id: 'cat-pharmacy', name: 'Pharmacy', group: 'grp-health' },
          ],
        },
        {
          id: 'grp-shopping',
          name: 'Shopping',
          categories: [
            {
              id: 'cat-merch',
              name: 'General Merchandise',
              group: 'grp-shopping',
            },
          ],
        },
      ],
    },
  }),
}));

vi.mock('#hooks/useCspCategories', () => ({
  useCspCategories: () => ({
    data: {
      list: [
        { id: 'csp-misc', name: 'Miscellaneous', group: 'csp-grp-fixed' },
        {
          id: 'csp-guilt-free',
          name: 'Guilt-Free Spending: Shopping',
          group: 'csp-grp-guilt-free',
        },
      ],
      grouped: [
        {
          id: 'csp-grp-fixed',
          name: 'Fixed Costs',
          categories: [
            { id: 'csp-misc', name: 'Miscellaneous', group: 'csp-grp-fixed' },
          ],
        },
        {
          id: 'csp-grp-guilt-free',
          name: 'Guilt-Free Spending',
          categories: [
            {
              id: 'csp-guilt-free',
              name: 'Guilt-Free Spending: Shopping',
              group: 'csp-grp-guilt-free',
            },
          ],
        },
      ],
    },
  }),
}));

vi.mock('#hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: [{ id: 'acct-1', name: 'Visa 9970' }],
  }),
}));

vi.mock('#redux', () => ({
  useDispatch: () => vi.fn(),
}));

describe('useAICategorizeSession', () => {
  const cvsPrediction: CategorizeResult = {
    standard_category_id: 'cat-pharmacy',
    csp_category_id: 'csp-misc',
    suggested_new_standard_category: null,
    suggested_standard_category_group_id: null,
    suggested_new_csp_category: null,
    suggested_csp_category_group_id: null,
    confidence: 'certain',
    suggest_rule_condition: 'payee',
    reasoning:
      "Transactions at CVS Pharmacy are consistently categorized as 'Pharmacy' under Health & Fitness and 'Miscellaneous' under Fixed Costs.",
  };

  const amazonPrediction: CategorizeResult = {
    standard_category_id: 'cat-merch',
    csp_category_id: 'csp-guilt-free',
    suggested_new_standard_category: null,
    suggested_standard_category_group_id: null,
    suggested_new_csp_category: null,
    suggested_csp_category_group_id: null,
    confidence: 'certain',
    suggest_rule_condition: 'payee',
    reasoning:
      "Amazon transactions are categorized as 'General Merchandise' and 'Guilt-Free Spending: Shopping'.",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves predicted CSP category for partially-categorized transactions across Skip, Back, and lookahead navigation', async () => {
    const transactions = [
      {
        id: 'tx-cvs',
        date: '2026-10-08',
        amount: -600,
        payee: 'payee-cvs',
        'payee.name': 'CVS',
        account: 'acct-1',
        'account.name': 'Visa 9970',
        notes: 'CVS PHARMACY ##09725',
        category: 'cat-pharmacy',
        csp_category: undefined,
      },
      {
        id: 'tx-amazon',
        date: '2026-10-06',
        amount: -1101,
        payee: 'payee-amazon',
        'payee.name': 'Amazon',
        account: 'acct-2',
        'account.name': 'Amex',
        notes: 'Amazon.com',
        category: 'cat-merch',
        csp_category: undefined,
      },
    ];

    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'query') {
        return { data: transactions, dependencies: [] };
      }
      if (name === 'ai-categorize-transaction') {
        const { transactionId } = args as { transactionId: string };
        if (transactionId === 'tx-cvs') {
          return cvsPrediction;
        }
        return amazonPrediction;
      }
      return undefined as never;
    });

    const { result } = renderHook(() => useAICategorizeSession({ bulk: true }));

    // 1. Initial load on CVS (partially categorized: category='cat-pharmacy', csp_category=undefined)
    await waitFor(() => {
      expect(result.current.currentTx?.id).toBe('tx-cvs');
      expect(result.current.selectedStandardId).toBe('cat-pharmacy');
      expect(result.current.selectedCspId).toBe('csp-misc');
      expect(result.current.createRule).toBe(true);
    });

    // Wait for background lookahead preload of Amazon to complete
    await waitFor(() => {
      expect(result.current.preloadStatus[0]).toBe('loaded');
    });

    // 2. Skip to Amazon (which already has category='cat-merch', csp_category=undefined, and is preloaded in predictionCache)
    act(() => {
      result.current.handleSkip();
    });

    expect(result.current.currentTx?.id).toBe('tx-amazon');
    expect(result.current.selectedStandardId).toBe('cat-merch');
    expect(result.current.selectedCspId).toBe('csp-guilt-free');
    expect(result.current.createRule).toBe(true);

    // 3. Navigate Back to CVS — should still have CSP category selected and createRule checked
    act(() => {
      result.current.handleBack();
    });

    expect(result.current.currentTx?.id).toBe('tx-cvs');
    expect(result.current.selectedStandardId).toBe('cat-pharmacy');
    expect(result.current.selectedCspId).toBe('csp-misc');
    expect(result.current.createRule).toBe(true);
  });

  it('restores accepted categories with createRule=false when navigating Back to an already-accepted transaction', async () => {
    const transactions = [
      {
        id: 'tx-cvs',
        date: '2026-10-08',
        amount: -600,
        payee: 'payee-cvs',
        'payee.name': 'CVS',
        account: 'acct-1',
        'account.name': 'Visa 9970',
        notes: 'CVS PHARMACY ##09725',
        category: 'cat-pharmacy',
        csp_category: undefined,
      },
      {
        id: 'tx-amazon',
        date: '2026-10-06',
        amount: -1101,
        payee: 'payee-amazon',
        'payee.name': 'Amazon',
        account: 'acct-2',
        'account.name': 'Amex',
        notes: 'Amazon.com',
        category: 'cat-merch',
        csp_category: undefined,
      },
    ];

    let cvsAccepted = false;

    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'query') {
        return {
          data: cvsAccepted ? [transactions[1]] : transactions,
          dependencies: [],
        };
      }
      if (name === 'ai-categorize-transaction') {
        const { transactionId } = args as { transactionId: string };
        return transactionId === 'tx-cvs' ? cvsPrediction : amazonPrediction;
      }
      if (name === 'ai-apply-categorization') {
        const payload = args as {
          standard_category_id: string | null;
          csp_category_id: string | null;
        };
        return {
          standard_category_id: payload.standard_category_id,
          csp_category_id: payload.csp_category_id,
        };
      }
      if (name === 'transaction-update') {
        cvsAccepted = true;
        return undefined as never;
      }
      if (name === 'rule-add') {
        return { id: 'rule-1' } as never;
      }
      return undefined as never;
    });

    const { result } = renderHook(() => useAICategorizeSession({ bulk: true }));

    await waitFor(() => {
      expect(result.current.currentTx?.id).toBe('tx-cvs');
      expect(result.current.selectedCspId).toBe('csp-misc');
    });

    const modalClose = vi.fn();
    await act(async () => {
      await result.current.handleAcceptAndNext(modalClose);
    });

    await waitFor(() => {
      expect(result.current.currentTx?.id).toBe('tx-amazon');
      expect(result.current.selectedStandardId).toBe('cat-merch');
      expect(result.current.selectedCspId).toBe('csp-guilt-free');
    });

    // Navigate Back to accepted CVS transaction
    act(() => {
      result.current.handleBack();
    });

    expect(result.current.currentTx?.id).toBe('tx-cvs');
    expect(result.current.selectedStandardId).toBe('cat-pharmacy');
    expect(result.current.selectedCspId).toBe('csp-misc');
    expect(result.current.createRule).toBe(false);
  });

  it('upgrades an existing single-action payee rule via rule-update instead of creating a duplicate rule', async () => {
    const existingRule = {
      id: 'rule-cvs',
      stage: null,
      conditionsOp: 'and' as const,
      conditions: [
        {
          op: 'is' as const,
          field: 'payee' as const,
          value: 'payee-cvs',
          type: 'id' as const,
        },
      ],
      actions: [
        {
          op: 'set' as const,
          field: 'category' as const,
          value: 'cat-pharmacy',
          type: 'id' as const,
        },
      ],
    };

    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'query') {
        return {
          data: [
            {
              id: 'tx-cvs',
              date: '2026-10-08',
              amount: -600,
              payee: 'payee-cvs',
              'payee.name': 'CVS',
              account: 'acct-1',
              'account.name': 'Visa 9970',
              notes: 'CVS PHARMACY ##09725',
              category: 'cat-pharmacy',
              csp_category: undefined,
            },
          ],
          dependencies: [],
        };
      }
      if (name === 'ai-categorize-transaction') {
        return cvsPrediction;
      }
      if (name === 'ai-apply-categorization') {
        const payload = args as {
          standard_category_id: string | null;
          csp_category_id: string | null;
        };
        return {
          standard_category_id: payload.standard_category_id,
          csp_category_id: payload.csp_category_id,
        };
      }
      if (name === 'rules-get') {
        return [existingRule] as never;
      }
      if (name === 'rule-update') {
        return args as never;
      }
      return undefined as never;
    });

    const { result } = renderHook(() => useAICategorizeSession({ bulk: true }));

    await waitFor(() => {
      expect(result.current.selectedStandardId).toBe('cat-pharmacy');
      expect(result.current.selectedCspId).toBe('csp-misc');
      expect(result.current.createRule).toBe(true);
    });

    act(() => {
      result.current.setApplyToExisting(false);
    });

    const modalClose = vi.fn();
    await act(async () => {
      await result.current.handleAcceptAndNext(modalClose);
    });

    expect(send).toHaveBeenCalledWith('rule-update', {
      ...existingRule,
      actions: [
        {
          op: 'set',
          field: 'category',
          value: 'cat-pharmacy',
          type: 'id',
        },
        {
          op: 'set',
          field: 'csp_category',
          value: 'csp-misc',
          type: 'id',
        },
      ],
    });
    expect(send).not.toHaveBeenCalledWith('rule-add', expect.anything());
  });
});
