import { GoogleGenAI, Type } from '@google/genai';

import { logger } from '#platform/server/log';
import { integerToAmount } from '#shared/util';

import { getAccountHistory, getPayeeHistory, getTaxonomies } from './context';
import type { TaxonomyContext } from './context';

import { getGeminiCustomInstructions, requireGeminiApiKey } from './index';

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

type TransactionInput = {
  id: string;
  payee: string | null;
  account: string;
  amount: number;
  notes: string | null;
  date: string;
  imported_payee?: string | null;
  transfer_id?: string | null;
  'category.name'?: string | null;
  'csp_category.name'?: string | null;
};

function formatAmount(amount: number): string {
  const decimal = integerToAmount(amount);
  const type = amount < 0 ? 'Outflow/Payment' : 'Inflow/Deposit';
  return `${decimal.toFixed(2)} (${type})`;
}

/**
 * Builds the system prompt with transaction data, context histories, taxonomy, and instructions.
 */
export function buildSystemPrompt(params: {
  taxonomies: TaxonomyContext;
  formattedPayeeHistory: unknown[];
  formattedAccountHistory: unknown[];
  transaction: TransactionInput;
  payeeName?: string;
  accountName?: string;
  accountOffBudget?: boolean;
  customInstructions: string | null;
  previousResult?: CategorizeResult | null;
  followUpMessage?: string;
}): string {
  const existingCategoryLines = [
    params.transaction['category.name']
      ? `Current Standard Category: ${params.transaction['category.name']}`
      : null,
    params.transaction['csp_category.name']
      ? `Current CSP Category: ${params.transaction['csp_category.name']}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  let systemPrompt = `You are an AI assistant integrated into Actual Budget, a local-first personal finance app.
Your task is to categorize a bank transaction into the user's specific taxonomy.
You must return a strict JSON response.

Here are the user's available Standard Categories:
${JSON.stringify(params.taxonomies.standard, null, 2)}

Here are the user's available CSP (High-Level) Categories:
${JSON.stringify(params.taxonomies.csp, null, 2)}

Here is the recent history of transactions for this specific Payee (to understand how the user usually categorizes this payee):
${JSON.stringify(params.formattedPayeeHistory, null, 2)}

Here is the recent history of transactions for this specific Account (e.g. to catch account-level patterns like a gas credit card):
${JSON.stringify(params.formattedAccountHistory, null, 2)}

Transaction to categorize:
Date: ${params.transaction.date}
Payee: ${params.payeeName || params.transaction.payee}
Original bank description: ${params.transaction.imported_payee || '(none)'}
Account: ${params.accountName || params.transaction.account}${params.accountOffBudget ? ' [OFF-BUDGET / tracking account]' : ''}
Amount: ${formatAmount(params.transaction.amount)}
Notes: ${params.transaction.notes || '(none)'}
Is transfer: ${params.transaction.transfer_id ? 'yes' : 'no'}${existingCategoryLines ? `\n${existingCategoryLines}` : ''}

Instructions:
1. Select the BEST 'standard_category_name' from the standard taxonomy. Use null only if no existing standard category fits and you are suggesting a new one via 'suggested_new_standard_category'.
2. Select the BEST 'csp_category_name' from the CSP taxonomy. Whenever the CSP taxonomy has categories, you MUST always select a 'csp_category_name' (or suggest a new one via 'suggested_new_csp_category' if none fit) — never leave both 'csp_category_name' and 'suggested_new_csp_category' as null.
   - NOTE: If the transaction is a transfer, off-budget, or should be ignored, you MUST select the category name of 'Ignored' from the CSP taxonomy instead of returning null (if an 'Ignored' category is present in the taxonomy).
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

  if (params.customInstructions) {
    systemPrompt += `

Additional Custom Instructions from User:
${params.customInstructions}`;
  }

  if (params.followUpMessage && params.previousResult) {
    systemPrompt += `

USER CORRECTION REQUEST:
The user reviewed your previous suggestion and has provided the following instruction or feedback:
"${params.followUpMessage}"

Your previous suggestion was:
${JSON.stringify(params.previousResult, null, 2)}

Please adjust your categorization (standard_category_name, csp_category_name, suggested_new_standard_category, suggested_new_csp_category, etc.) and reasoning based on this feedback.`;
  }

  return systemPrompt;
}

/**
 * Resolves a category name (or ID / group-qualified name) to its corresponding UUID from the provided taxonomy list.
 */
export function resolveCategoryId(
  categoryName: string | null,
  categories: Array<{ id: string; name: string }>,
): string | null {
  if (!categoryName) {
    return null;
  }
  const trimmed = categoryName.trim();
  if (!trimmed) {
    return null;
  }
  const lowerName = trimmed.toLowerCase();

  const exactMatch = categories.find(
    c =>
      c.name.trim().toLowerCase() === lowerName ||
      c.id.toLowerCase() === lowerName,
  );
  if (exactMatch) {
    return exactMatch.id;
  }

  // Handle "Group > Category", "Group: Category", "Group - Category", "Group / Category"
  const separatorParts = trimmed.split(/\s*(?:>|→|:|\/|-|—)\s*/);
  if (separatorParts.length > 1) {
    const lastPart = separatorParts[separatorParts.length - 1]
      .trim()
      .toLowerCase();
    const byLastPart = categories.find(
      c => c.name.trim().toLowerCase() === lastPart,
    );
    if (byLastPart) {
      return byLastPart.id;
    }
  }

  // Handle "Category (Group)"
  const parenMatch = trimmed.match(/^(.+?)\s*\([^)]+\)$/);
  if (parenMatch) {
    const baseName = parenMatch[1].trim().toLowerCase();
    const byBaseName = categories.find(
      c => c.name.trim().toLowerCase() === baseName,
    );
    if (byBaseName) {
      return byBaseName.id;
    }
  }

  return null;
}

export function resolveGroupId(
  groupIdOrName: string | null,
  groups: Array<{ groupId: string; groupName: string }>,
): string | null {
  if (!groupIdOrName) {
    return null;
  }
  const trimmed = groupIdOrName.trim();
  if (!trimmed) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  const match = groups.find(
    g =>
      g.groupId.toLowerCase() === lower ||
      g.groupName.trim().toLowerCase() === lower,
  );
  return match ? match.groupId : null;
}

/**
 * Calls Gemini to auto-categorize the given transaction.
 */
export async function categorizeTransaction(
  transaction: TransactionInput,
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
    transaction.payee
      ? await getPayeeHistory(transaction.payee, transaction.id)
      : []
  ) as TransactionHistoryItem[];
  const accountHistory = (await getAccountHistory(
    transaction.account,
    transaction.id,
  )) as TransactionHistoryItem[];

  const formattedPayeeHistory = payeeHistory.map(h => ({
    ...h,
    amount: formatAmount(h.amount),
  }));

  const formattedAccountHistory = accountHistory.map(h => ({
    ...h,
    amount: formatAmount(h.amount),
  }));

  const customInstructions = await getGeminiCustomInstructions();

  const systemPrompt = buildSystemPrompt({
    taxonomies,
    formattedPayeeHistory,
    formattedAccountHistory,
    transaction,
    payeeName,
    accountName,
    accountOffBudget,
    customInstructions,
    previousResult,
    followUpMessage,
  });

  const allStandardCategories = taxonomies.standard.flatMap(g => g.categories);
  const allCspCategories = taxonomies.csp.flatMap(g => g.categories);
  const standardCategoryNames = [
    ...new Set(allStandardCategories.map(c => c.name)),
  ];
  const cspCategoryNames = [...new Set(allCspCategories.map(c => c.name))];
  const standardGroupIds = taxonomies.standard.map(g => g.groupId);
  const cspGroupIds = taxonomies.csp.map(g => g.groupId);

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: systemPrompt,
    config: {
      temperature: 0.1,
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          standard_category_name: {
            type: Type.STRING,
            nullable: true,
            ...(standardCategoryNames.length > 0
              ? { enum: standardCategoryNames }
              : {}),
          },
          csp_category_name: {
            type: Type.STRING,
            nullable: true,
            ...(cspCategoryNames.length > 0 ? { enum: cspCategoryNames } : {}),
          },
          suggested_new_standard_category: {
            type: Type.STRING,
            nullable: true,
          },
          suggested_standard_category_group_id: {
            type: Type.STRING,
            nullable: true,
            ...(standardGroupIds.length > 0 ? { enum: standardGroupIds } : {}),
          },
          suggested_new_csp_category: { type: Type.STRING, nullable: true },
          suggested_csp_category_group_id: {
            type: Type.STRING,
            nullable: true,
            ...(cspGroupIds.length > 0 ? { enum: cspGroupIds } : {}),
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
        required: [
          'confidence',
          'suggest_rule_condition',
          'reasoning',
          'standard_category_name',
          'csp_category_name',
        ],
      },
    },
  });

  const text = response.text;
  logger.info('Gemini System Prompt:\n', systemPrompt);
  logger.info('Gemini Response Text:\n', text);
  if (!text) {
    throw new Error('No text returned from Gemini');
  }

  try {
    const parsed = JSON.parse(text) as {
      standard_category_name: string | null;
      csp_category_name: string | null;
      suggested_new_standard_category: string | null;
      suggested_standard_category_group_id: string | null;
      suggested_new_csp_category: string | null;
      suggested_csp_category_group_id: string | null;
      confidence: 'certain' | 'confident' | 'unsure';
      suggest_rule_condition: 'payee' | 'account' | 'both';
      reasoning: string;
    };

    let standard_category_id = resolveCategoryId(
      parsed.standard_category_name,
      allStandardCategories,
    );
    if (!standard_category_id && parsed.suggested_new_standard_category) {
      standard_category_id = resolveCategoryId(
        parsed.suggested_new_standard_category,
        allStandardCategories,
      );
    }

    let csp_category_id = resolveCategoryId(
      parsed.csp_category_name,
      allCspCategories,
    );
    if (!csp_category_id && parsed.suggested_new_csp_category) {
      csp_category_id = resolveCategoryId(
        parsed.suggested_new_csp_category,
        allCspCategories,
      );
    }

    const suggested_standard_category_group_id = standard_category_id
      ? null
      : resolveGroupId(
          parsed.suggested_standard_category_group_id,
          taxonomies.standard,
        );
    const suggested_new_standard_category =
      !standard_category_id && suggested_standard_category_group_id
        ? parsed.suggested_new_standard_category
        : null;

    const suggested_csp_category_group_id = csp_category_id
      ? null
      : resolveGroupId(parsed.suggested_csp_category_group_id, taxonomies.csp);
    const suggested_new_csp_category =
      !csp_category_id && suggested_csp_category_group_id
        ? parsed.suggested_new_csp_category
        : null;

    return {
      standard_category_id,
      csp_category_id,
      suggested_new_standard_category,
      suggested_standard_category_group_id,
      suggested_new_csp_category,
      suggested_csp_category_group_id,
      confidence: parsed.confidence,
      suggest_rule_condition: parsed.suggest_rule_condition,
      reasoning: parsed.reasoning,
    };
  } catch {
    throw new Error('Failed to parse Gemini JSON output: ' + text);
  }
}
