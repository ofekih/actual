import { createApp } from '../app';
import { mutator } from '../mutators';

import { testGeminiConnection } from './index';
import { categorizeTransaction } from './categorize';

export type AIHandlers = {
  'ai-test-connection': () => Promise<{ success: boolean; message: string }>;
  'ai-categorize-transaction': (args: { transactionId: string; payeeName?: string }) => Promise<import('./categorize').CategorizeResult>;
  'ai-test-categorize-random': () => Promise<import('./categorize').CategorizeResult & { transactionInfo: string }>;
  'ai-seed-categories': () => Promise<{ success: boolean }>;
};

export const app = createApp<AIHandlers>();

app.method('ai-test-connection', async () => {
  return testGeminiConnection();
});

app.method('ai-categorize-transaction', async ({ transactionId, payeeName }) => {
  const { aqlQuery } = require('../aql');
  const { q } = require('#shared/query');
  const { data } = await aqlQuery(q('transactions').filter({ id: transactionId }).select('*'));
  if (!data || data.length === 0) {
    throw new Error('Transaction not found');
  }
  return categorizeTransaction(data[0], payeeName);
});

app.method('ai-test-categorize-random', async () => {
  const { aqlQuery } = require('../aql');
  const { q } = require('#shared/query');
  // Grab the most recent transaction that has a payee
  const { data } = await aqlQuery(
    q('transactions').filter({ payee: { $ne: null }, is_parent: false }).orderBy({ date: 'desc' }).limit(1).select(['*', 'payee.name'])
  );
  if (!data || data.length === 0) {
    throw new Error('No transactions found in the database to test with.');
  }
  const tx = data[0];
  const result = await categorizeTransaction(tx, tx['payee.name']);
  return {
    ...result,
    transactionInfo: `Payee: ${tx['payee.name']}, Amount: ${tx.amount}, Date: ${tx.date}, Notes: ${tx.notes}`
  };
});

app.method('ai-seed-categories', mutator(async () => {
  const { seedCategories } = require('./seed');
  return seedCategories();
}));
