import { createApp } from '#server/app';
import { mutator } from '#server/mutators';

import { categorizeTransaction } from './categorize';

import { testGeminiConnection } from './index';

export type AIHandlers = {
  'ai-test-connection': () => Promise<{ success: boolean; message: string }>;
  'ai-categorize-transaction': (args: {
    transactionId: string;
    payeeName?: string;
  }) => Promise<import('./categorize').CategorizeResult>;
  'ai-test-categorize-random': () => Promise<
    import('./categorize').CategorizeResult & { transactionInfo: string }
  >;
  'ai-seed-categories': () => Promise<{ success: boolean }>;
  'ai-apply-categorization': (args: {
    standard_category_id: string | null;
    csp_category_id: string | null;
    is_income: boolean;
    suggested_new_standard_category: { name: string; groupId: string } | null;
    suggested_new_csp_category: { name: string; groupId: string } | null;
  }) => Promise<{
    standard_category_id: string | null;
    csp_category_id: string | null;
  }>;
};

export const app = createApp<AIHandlers>();

app.method('ai-test-connection', async () => {
  return testGeminiConnection();
});

app.method(
  'ai-categorize-transaction',
  async ({ transactionId, payeeName }) => {
    const { aqlQuery } = require('../aql');
    const { q } = require('#shared/query');
    const { data } = await aqlQuery(
      q('transactions').filter({ id: transactionId }).select('*'),
    );
    if (!data || data.length === 0) {
      throw new Error('Transaction not found');
    }
    return categorizeTransaction(data[0], payeeName);
  },
);

app.method('ai-test-categorize-random', async () => {
  const { aqlQuery } = require('../aql');
  const { q } = require('#shared/query');
  // Grab the most recent transaction that has a payee
  const { data } = await aqlQuery(
    q('transactions')
      .filter({ payee: { $ne: null }, is_parent: false })
      .orderBy({ date: 'desc' })
      .limit(1)
      .select(['*', 'payee.name']),
  );
  if (!data || data.length === 0) {
    throw new Error('No transactions found in the database to test with.');
  }
  const tx = data[0];
  const result = await categorizeTransaction(tx, tx['payee.name']);
  return {
    ...result,
    transactionInfo: `Payee: ${tx['payee.name']}, Amount: ${tx.amount}, Date: ${tx.date}, Notes: ${tx.notes}`,
  };
});

app.method(
  'ai-seed-categories',
  mutator(async () => {
    const { seedCategories } = require('./seed');
    return seedCategories();
  }),
);

app.method(
  'ai-apply-categorization',
  mutator(async args => {
    const { insertCategory, insertWithUUID } = require('../db');

    let standardCatId = args.standard_category_id;
    let cspCatId = args.csp_category_id;

    if (args.suggested_new_standard_category) {
      standardCatId = await insertCategory({
        name: args.suggested_new_standard_category.name,
        cat_group: args.suggested_new_standard_category.groupId,
        is_income: args.is_income ? 1 : 0,
      });
    }

    if (args.suggested_new_csp_category) {
      cspCatId = await insertWithUUID('csp_categories', {
        name: args.suggested_new_csp_category.name,
        group_id: args.suggested_new_csp_category.groupId,
      });
    }

    return { standard_category_id: standardCatId, csp_category_id: cspCatId };
  }),
);
