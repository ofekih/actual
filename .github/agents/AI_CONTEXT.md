# AI Context & Vision for Actual Budget (NO Finances fork)

This file serves as a persistent context guide for future AI agents working on this Actual Budget repository. It outlines the user's overarching vision for transaction categorization, AI integration, and the Conscious Spending Plan (CSP), and documents how the CSP is actually implemented today.

This repo is a personal fork of `actualbudget/actual` (web app branded **NO Finances**). The CSP tab (`/csp`) is the default landing route instead of `/budget`.

## 1. Categorization Taxonomy (Double-Classification System)

Every transaction has TWO distinct, parallel 2-tier categorizations:

1. **Standard Taxonomy:** `Category Group` -> `Category` (e.g., "Food & Drink" -> "Restaurants"). Stored in `transactions.category`. Used for granular tracking and the regular envelope/tracking budget.
2. **CSP Taxonomy:** `CSP Category Group` -> `CSP Category` (e.g., "Fixed Costs" -> "Housing"). Stored in `transactions.csp_category`. Based on Ramit Sethi's Conscious Spending Plan. Used for high-level, actionable insights on the CSP tab.

_Note: While category options should generally be fixed, if the LLM determines no existing category is adequate, it must be able to suggest a new one in either taxonomy._

## 2. LLM Requirements & Context Injection

- **Model**: Gemini 3.8 Flash (`gemini-3.8-flash`, set in `packages/loot-core/src/server/ai/index.ts` and `categorize.ts`).
- **Workflow:** An "AI Categorize All" button at the top of the transaction list queries the LLM for all uncategorized items (missing `category` **or** `csp_category`) and opens `AICategorizeReviewModal` so the user can review/override both taxonomies before applying (`useAICategorizeSession`).
- **One-off vs. Rule Creation:** The LLM can suggest a one-off categorization or propose a rule to handle similar transactions indefinitely. The UI must allow the user to override these suggestions.
- **Grounding**: Uses Google Search Grounding to identify obscure merchants.
- **Context Injection** (`packages/loot-core/src/server/ai/context.ts`):
  - The current Standard Taxonomy and CSP Taxonomy.
  - The last 5-10 categorized transactions for the _same payee_.
  - The last 5-10 categorized transactions for the _same account_ (e.g. Credit Card) to understand context-specific spending patterns.
  - The schema for Actual's internal Rule Engine (Conditions & Actions).
- **Settings** (Settings → AI): Gemini API key (stored in the budget file), Test Connection / Test Categorization, Custom AI Instructions appended to the system prompt, and "Seed Default Categories" (`server/ai/seed.ts` — **destructive**: wipes CSP categories and clears every transaction's `csp_category` before re-seeding both taxonomies).

## 3. CSP Implementation (current state)

The CSP is implemented and is the primary planning view. Key facts an agent needs:

### Data model (loot-core)

- Tables: `csp_category_groups`, `csp_categories` (view `v_csp_categories`), `csp_targets`. Types in `packages/loot-core/src/types/models/csp-category{,-group}.ts`.
- `csp_categories.moving_average_months` — the **Amortize...** setting (UI name "Category Amortization"; the old "moving average"/"smoothing" names survive in the column and some code).
- `csp_targets` rows are `(category, month YYYYMM, amount)`. `csp/get-targets` returns, per category, the most recent target with `month <= requested month`, so **a planned amount carries forward** until changed. `csp/set-target` writes the month being edited. Targets are stored as absolute values (sign is never meaningful).
- Rules support `csp_category` and `csp_category_group` fields/actions. Payee "learning" (`transaction-rules.ts` `getProbableCategory`) learns `csp_category` alongside `category`, and bank sync (`accounts/sync.ts` reconcile/match) preserves `csp_category`.
- Synced prefs: `csp-account-types` (JSON map accountId → `savings` | `investments` | `assets` | `auto` | `debt`), `csp-user-birth-date`, `csp-spouse-name`, `csp-spouse-birth-date` (+ derived `*-birth-year`), `csp-monte-carlo-config`.

### CSP tab UI (desktop-client)

- Main page: `packages/desktop-client/src/components/csp/index.tsx` (`Csp`). It **reuses the budget table** (`AutoSizingBudgetTable`) by adapting CSP groups into `CategoryGroupEntity[]` (`useCspCategoryGroups`) and injecting them through `CategoriesOverrideContext`, and swaps the month cells via `CspComponentsContext` (`CspCategoryMonth`, `CspGroupMonth`, `CspHeaderMonth`, `CspBudgetSummary`). Changes to shared budget components (`components/budget/*`) can affect the CSP tab — check `useCategoriesOverride()` / `isCsp` branches.
- Each month shows **Planned** (editable target) and **Actual** columns, each with a % of income. Multiple months display side by side (global `maxMonths` pref).
- **Actual** = sum of `csp_category` amounts for the month, **on-budget accounts only** (`'account.offbudget': false`). For amortized categories it is replaced by the forward amortization value (see below).
- **Deviation styling** on Actual: ≥10% / ≥5% over or under Planned shows double/single arrows; for expenses over = red/orange, under = blue/light blue; for income the colors are inverted (over = green).
- **Net worth summary card** at the top of each month: Assets / Investments / Savings / Debt totals from `csp-account-types` (closed accounts excluded; `auto` counts as Assets); clicking a row opens a per-account popover. Mobile equivalent: `CspBudgetSummaryModal`.
- **Net Cash Flow footer row** (`CspFooterRow.tsx`): Planned = income target − all planned allocations; Actual = actual income − actual spending, with a click-to-open breakdown popover (actual income, available for guilt-free, guilt-free spent, net surplus/deficit).
- **Drill-down:** clicking an Actual cell navigates to `/accounts` filtered by `csp_category` (or `csp_category_group` for group rows), on-budget only; amortized categories widen the date range to cover the amortization window.
- **Category sidebar menu** on CSP adds **Amortize...** (`CspCategorySettingsModal`); amortized categories show a trending-up icon with "Amortized over N months". Monthly category **notes forward-propagate** to later months (shared with the budget view).
- Mobile: `components/mobile/csp/MobileCspPage.tsx`.

### Name-based conventions (important gotchas)

CSP logic keys off **group/category names**, not flags:

- A group whose name contains `income` is the income group (sorted to the top; drives all % calculations).
- The group whose name contains `guilt-free`: its **first category is automatic** — its Planned value is `max(0, income targets − all other planned allocations)` and is read-only.
- Groups/categories whose names contain `N/A` or `Ignored` are hidden from the CSP table (used for transfers, card payments, etc.).
- Monte Carlo matches groups by `invest`, `fixed`, and `guilt`/`fun`.

Renaming these groups silently changes behavior.

### Forward coverage amortization

`calculateForwardAmortization` (`csp/index.tsx`, tests in `csp/index.test.ts`): each month's total for an amortized category is spread evenly over the next N months starting in the month paid. If a payment lands in the **last** month of the previous coverage window (early renewal), it is shifted to start the following month so it does not double count. The audit query looks back `max(12, N) * 2` months (or to the budget start).

### Other CSP integrations

- **Net Worth report / custom reports:** a "CSP mode" toggle groups accounts by `csp-account-types` (`useCspNetWorthData`, `getCspNetWorthData` in `reports/util.ts`).
- **Monte Carlo report** (`reports/reports/monte-carlo/csp/`): `CspSetupModal` imports CSP investment accounts as live pots and annual contributions from the Investments group (planned or trailing-12-month actual), derives living expenses from Fixed Costs + Guilt-Free, supports a retirement spending multiplier, calendar-year timelines with household age milestones (from the birthday prefs), and a retirement solver (`retirementSolver.ts`).
- **Demo Mode** (`server/budgetfiles/demo-mode.ts`, `DemoModeModal`): clones the open budget with synthetic balances and a limited history window for sharing.
- **Account types:** the bank-sync linking modal and account tables include a CSP account type dropdown that writes `csp-account-types`; the sidebar groups accounts by these types.

## 4. LLM Instructions

- **Do not assume things:** If requirements are ambiguous, query the user.
- **No unsolicited code changes:** Unless explicitly requested, do not modify code. Propose plans and brainstorm first.
- **Document context:** Keep this file up to date when CSP behavior or other high-level architecture changes, so the user does not have to repeat context.
- **Manual testing:** for CSP work, test against the user's real budget via `yarn start:server-dev` (local sync server, port 3001) rather than the generic "View demo" budget, which has no CSP categories. Treat its data as private: never copy real amounts, account names, or payees into code, tests, docs, or commits.
