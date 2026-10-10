import { describe, expect, it } from 'vitest';

import {
  buildSystemPrompt,
  resolveCategoryId,
  resolveGroupId,
} from './categorize';
import type { TaxonomyContext } from './context';

describe('AI categorization helpers', () => {
  const sampleCspCategories = [
    { id: 'csp-misc', name: 'Miscellaneous' },
    { id: 'csp-groceries', name: 'Groceries' },
    { id: 'csp-dining', name: 'Restaurants & Dining' },
    { id: 'csp-ignored', name: 'Ignored' },
  ];

  const sampleGroups = [
    { groupId: 'grp-fixed', groupName: 'Fixed Costs' },
    { groupId: 'grp-guilt-free', groupName: 'Guilt-Free Spending' },
  ];

  describe('resolveCategoryId', () => {
    it('resolves exact category names case-insensitively', () => {
      expect(resolveCategoryId('Miscellaneous', sampleCspCategories)).toBe(
        'csp-misc',
      );
      expect(resolveCategoryId('  miscellaneous  ', sampleCspCategories)).toBe(
        'csp-misc',
      );
    });

    it('resolves category IDs if returned instead of names', () => {
      expect(resolveCategoryId('csp-misc', sampleCspCategories)).toBe(
        'csp-misc',
      );
    });

    it('resolves group-qualified category names such as "Group: Category" or "Group > Category"', () => {
      expect(
        resolveCategoryId('Fixed Costs: Miscellaneous', sampleCspCategories),
      ).toBe('csp-misc');
      expect(
        resolveCategoryId(
          'Guilt-Free Spending > Restaurants & Dining',
          sampleCspCategories,
        ),
      ).toBe('csp-dining');
    });

    it('resolves category names with parenthetical group suffixes', () => {
      expect(
        resolveCategoryId('Miscellaneous (Fixed Costs)', sampleCspCategories),
      ).toBe('csp-misc');
    });

    it('returns null for null, empty, or unknown names', () => {
      expect(resolveCategoryId(null, sampleCspCategories)).toBeNull();
      expect(resolveCategoryId('   ', sampleCspCategories)).toBeNull();
      expect(resolveCategoryId('Nonexistent', sampleCspCategories)).toBeNull();
    });
  });

  describe('resolveGroupId', () => {
    it('resolves group by ID or name case-insensitively', () => {
      expect(resolveGroupId('grp-fixed', sampleGroups)).toBe('grp-fixed');
      expect(resolveGroupId('Fixed Costs', sampleGroups)).toBe('grp-fixed');
      expect(resolveGroupId('  guilt-free spending ', sampleGroups)).toBe(
        'grp-guilt-free',
      );
      expect(resolveGroupId('Unknown Group', sampleGroups)).toBeNull();
    });
  });

  describe('buildSystemPrompt', () => {
    it('includes existing category information and requires CSP category selection', () => {
      const taxonomies: TaxonomyContext = {
        standard: [
          {
            groupName: 'Health & Fitness',
            groupId: 'grp-health',
            isIncome: false,
            categories: [
              { id: 'cat-pharmacy', name: 'Pharmacy', isIncome: false },
            ],
          },
        ],
        csp: [
          {
            groupName: 'Fixed Costs',
            groupId: 'grp-fixed',
            categories: [{ id: 'csp-misc', name: 'Miscellaneous' }],
          },
        ],
      };

      const prompt = buildSystemPrompt({
        taxonomies,
        formattedPayeeHistory: [],
        formattedAccountHistory: [],
        transaction: {
          id: 'tx-cvs',
          payee: 'payee-cvs',
          account: 'acct-1',
          amount: -600,
          notes: 'CVS PHARMACY ##09725',
          date: '2026-10-08',
          'category.name': 'Pharmacy',
          'csp_category.name': null,
        },
        payeeName: 'CVS',
        accountName: 'Visa 9970',
        customInstructions: null,
      });

      expect(prompt).toContain('Current Standard Category: Pharmacy');
      expect(prompt).toContain(
        "never leave both 'csp_category_name' and 'suggested_new_csp_category' as null",
      );
    });
  });
});
