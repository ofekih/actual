# AI Context & Vision for Actual Budget

This file serves as a persistent context guide for future AI agents working on this Actual Budget repository. It outlines the user's overarching vision for transaction categorization, AI integration, and the Conscious Spending Plan (CSP).

## 1. Categorization Taxonomy (Double-Classification System)

The user envisions a double-classification system where transactions have TWO distinct, parallel 2-tier categorizations:

1. **Standard Taxonomy:** `Category Group` -> `Category` (e.g., "Food & Drink" -> "Restaurants"). Used for granular tracking.
2. **CSP Taxonomy:** `CSP Category Group` -> `CSP Category` (e.g., "Fixed Costs" -> "Rent"). Based on Ramit Sethi's Conscious Spending Plan. Used for high-level, actionable insights.

_Note: While category options should generally be fixed, if the LLM determines no existing category is adequate, it must be able to suggest a new one in either taxonomy._

## 2. LLM Requirements & Context Injection

- **Model**: Gemini 3.5.
- **Workflow:** A button at the top of the transaction list will query the LLM for all uncategorized items to quickly categorize them.
- **One-off vs. Rule Creation:** The LLM should be able to suggest a one-off categorization or propose a rule to handle similar transactions indefinitely. The UI must allow the user to override these suggestions.
- **Grounding**: Must use Google Search Grounding to identify obscure merchants.
- **Context Injection**:
  - The current Standard Taxonomy and CSP Taxonomy.
  - The last 5-10 categorized transactions for the _same payee_.
  - The last 5-10 categorized transactions for the _same account_ (e.g. Credit Card) to understand context-specific spending patterns.
  - The schema for Actual's internal Rule Engine (Conditions & Actions).

## 3. Future Goals (CSP Mapping)

Eventually, the user wants Actual to support their Conscious Spending Plan (CSP). This will require mapping the existing Category Groups/Categories into the 5 CSP buckets.

## 4. LLM Instructions

- **Do not assume things:** If requirements are ambiguous, query the user.
- **No unsolicited code changes:** Unless explicitly requested, do not modify code. Propose plans and brainstorm first.
- **Document context:** Continuously update this file or similar documentation when new high-level architectural decisions are made so the user does not have to repeat context.
