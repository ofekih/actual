import { GoogleGenAI, Type } from '@google/genai';

import { getAccountHistory, getPayeeHistory, getTaxonomies } from './context';

import { requireGeminiApiKey } from './index';

export type CategorizeResult = {
  standard_category_id: string | null;
  csp_category_id: string | null;
  suggested_new_standard_category: string | null;
  suggested_standard_category_group_id: string | null;
  suggested_new_csp_category: string | null;
  suggested_csp_category_group_id: string | null;
  confidence: 'high' | 'medium' | 'low';
  suggest_rule: boolean;
  reasoning: string;
};

export async function categorizeTransaction(
  transaction: {
    id: string;
    payee: string | null;
    account: string;
    amount: number;
    notes: string | null;
    date: string;
  },
  payeeName?: string,
): Promise<CategorizeResult> {
  const apiKey = await requireGeminiApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const taxonomies = await getTaxonomies();
  const payeeHistory = transaction.payee
    ? await getPayeeHistory(transaction.payee)
    : [];
  const accountHistory = await getAccountHistory(transaction.account);

  const systemPrompt = `You are an AI assistant integrated into Actual Budget, a local-first personal finance app.
Your task is to categorize a bank transaction into the user's specific taxonomy.
You must return a strict JSON response.

Here are the user's available Standard Categories:
${JSON.stringify(taxonomies.standard, null, 2)}

Here are the user's available CSP (High-Level) Categories:
${JSON.stringify(taxonomies.csp, null, 2)}

Here is the recent history of transactions for this specific Payee (to understand how the user usually categorizes this payee):
${JSON.stringify(payeeHistory, null, 2)}

Here is the recent history of transactions for this specific Account (e.g. to catch account-level patterns like a gas credit card):
${JSON.stringify(accountHistory, null, 2)}

Transaction to categorize:
Date: ${transaction.date}
Payee: ${payeeName || transaction.payee}
Amount: ${transaction.amount}
Notes: ${transaction.notes}

Instructions:
1. Select the BEST 'standard_category_id' from the standard taxonomy. Use null if nothing fits.
2. Select the BEST 'csp_category_id' from the CSP taxonomy. Use null if nothing fits.
3. IF no existing categories fit, you may suggest a NEW category. To do so:
   - For standard: provide 'suggested_new_standard_category' (the name) and 'suggested_standard_category_group_id' (the ID of the existing group it belongs to).
   - For CSP: provide 'suggested_new_csp_category' (the name) and 'suggested_csp_category_group_id' (the ID of the existing group it belongs to).
4. Provide a 'confidence' score between 0.0 and 1.0.
5. Provide a 'reasoning' string explaining your choice briefly.
6. If you are highly confident (e.g., > 0.9) that this Payee should ALWAYS be mapped to these categories, set 'suggest_rule' to true.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: systemPrompt,
    config: {
      temperature: 0.1,
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
          confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
          suggest_rule: { type: Type.BOOLEAN },
          reasoning: { type: Type.STRING },
        },
        required: ['confidence', 'suggest_rule', 'reasoning'],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('No text returned from Gemini');
  }

  try {
    const result = JSON.parse(text) as CategorizeResult;
    return result;
  } catch (e) {
    throw new Error('Failed to parse Gemini JSON output: ' + text);
  }
}
