import { GoogleGenAI, Type } from '@google/genai';

import { integerToAmount } from '#shared/util';

import { getAccountHistory, getPayeeHistory, getTaxonomies } from './context';

import { requireGeminiApiKey } from './index';

export type CategorizeResult = {
  standard_category_id: string | null;
  csp_category_id: string | null;
  suggested_new_standard_category: string | null;
  suggested_standard_category_group_id: string | null;
  suggested_new_csp_category: string | null;
  suggested_csp_category_group_id: string | null;
  confidence: 'certain' | 'confident' | 'unsure';
  suggest_rule_condition: 'payee' | 'account' | 'both';
  reasoning: string;
};

type TransactionHistoryItem = {
  date: string;
  amount: number;
  'payee.name'?: string;
  notes?: string | null;
  'category.name'?: string | null;
  'csp_category.name'?: string | null;
};

function formatAmount(amount: number): string {
  const decimal = integerToAmount(amount);
  const type = amount < 0 ? 'Outflow/Payment' : 'Inflow/Deposit';
  return `${decimal.toFixed(2)} (${type})`;
}

export async function categorizeTransaction(
  transaction: {
    id: string;
    payee: string | null;
    account: string;
    amount: number;
    notes: string | null;
    date: string;
    imported_payee?: string | null;
    transfer_id?: string | null;
  },
  payeeName?: string,
  accountName?: string,
  accountOffBudget?: boolean,
  previousResult?: CategorizeResult | null,
  followUpMessage?: string,
): Promise<CategorizeResult> {
  const apiKey = await requireGeminiApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const taxonomies = await getTaxonomies();
  const payeeHistory = (
    transaction.payee ? await getPayeeHistory(transaction.payee) : []
  ) as TransactionHistoryItem[];
  const accountHistory = (await getAccountHistory(
    transaction.account,
  )) as TransactionHistoryItem[];

  const formattedPayeeHistory = payeeHistory.map(h => ({
    ...h,
    amount: formatAmount(h.amount),
  }));

  const formattedAccountHistory = accountHistory.map(h => ({
    ...h,
    amount: formatAmount(h.amount),
  }));

  let systemPrompt = `You are an AI assistant integrated into Actual Budget, a local-first personal finance app.
Your task is to categorize a bank transaction into the user's specific taxonomy.
You must return a strict JSON response.

Here are the user's available Standard Categories:
${JSON.stringify(taxonomies.standard, null, 2)}

Here are the user's available CSP (High-Level) Categories:
${JSON.stringify(taxonomies.csp, null, 2)}

Here is the recent history of transactions for this specific Payee (to understand how the user usually categorizes this payee):
${JSON.stringify(formattedPayeeHistory, null, 2)}

Here is the recent history of transactions for this specific Account (e.g. to catch account-level patterns like a gas credit card):
${JSON.stringify(formattedAccountHistory, null, 2)}

Transaction to categorize:
Date: ${transaction.date}
Payee: ${payeeName || transaction.payee}
Original bank description: ${transaction.imported_payee || '(none)'}
Account: ${accountName || transaction.account}${accountOffBudget ? ' [OFF-BUDGET / tracking account]' : ''}
Amount: ${formatAmount(transaction.amount)}
Notes: ${transaction.notes || '(none)'}
Is transfer: ${transaction.transfer_id ? 'yes' : 'no'}

Instructions:
1. Select the BEST 'standard_category_id' from the standard taxonomy. Use null if nothing fits.
2. Select the BEST 'csp_category_id' from the CSP taxonomy. Use null if nothing fits.
3. IF no existing categories fit, you may suggest a NEW category to be created. To do so:
   - Understand that categories are structured under Category Groups. Group definitions include "isIncome: true" (for income, initial setup funding, or inflows) or "isIncome: false" (for standard spending and expenses).
   - If the transaction is an inflow (e.g. paycheck, interest, refund) and no existing income categories fit, suggest a new category name under an income group (a group with "isIncome: true").
   - If the transaction is an outflow/spending and no existing categories fit, suggest a new category name under a relevant spending group (a group with "isIncome: false").
   - For standard: provide 'suggested_new_standard_category' (the new category name) and 'suggested_standard_category_group_id' (the ID of the existing group it belongs to).
   - For CSP: provide 'suggested_new_csp_category' (the new category name) and 'suggested_csp_category_group_id' (the ID of the existing group it belongs to).
4. Provide a 'confidence' score: 'certain', 'confident', or 'unsure'.
5. Provide a 'reasoning' string explaining your choice briefly.
6. For 'suggest_rule_condition': decide whether the rule should match on 'payee', 'account', or 'both'. Pick the broadest category that should always apply. Don't include both payee and account in the conditions if one would suffice.
   - Use 'account' when the category is driven by the account type (e.g., an investment/retirement/off-budget account, a dedicated credit card), not by the specific payee.
   - Use 'payee' when the specific vendor/payee drives the category (e.g., Netflix, Amazon, a specific grocery store).
   - Use 'both' when both are necessary (e.g., a specific payee that only appears in one account).`;

  if (followUpMessage && previousResult) {
    systemPrompt += `

USER CORRECTION REQUEST:
The user reviewed your previous suggestion and has provided the following instruction or feedback:
"${followUpMessage}"

Your previous suggestion was:
${JSON.stringify(previousResult, null, 2)}

Please adjust your categorization (standard_category_id, csp_category_id, suggested_new_standard_category, suggested_new_csp_category, etc.) and reasoning based on this feedback.`;
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: systemPrompt,
    config: {
      temperature: 0.1,
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          standard_category_id: { type: Type.STRING, nullable: true },
          csp_category_id: { type: Type.STRING, nullable: true },
          suggested_new_standard_category: {
            type: Type.STRING,
            nullable: true,
          },
          suggested_standard_category_group_id: {
            type: Type.STRING,
            nullable: true,
          },
          suggested_new_csp_category: { type: Type.STRING, nullable: true },
          suggested_csp_category_group_id: {
            type: Type.STRING,
            nullable: true,
          },
          confidence: {
            type: Type.STRING,
            enum: ['certain', 'confident', 'unsure'],
          },
          suggest_rule_condition: {
            type: Type.STRING,
            enum: ['payee', 'account', 'both'],
          },
          reasoning: { type: Type.STRING },
        },
        required: ['confidence', 'suggest_rule_condition', 'reasoning'],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('No text returned from Gemini');
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const result = JSON.parse(text) as CategorizeResult;
    return result;
  } catch {
    throw new Error('Failed to parse Gemini JSON output: ' + text);
  }
}
