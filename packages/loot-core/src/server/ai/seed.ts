import { all, delete_, insertWithUUID, insertCategoryGroup, insertCategory, runQuery } from '../db';
import { SORT_INCREMENT } from '../db/sort';
import { batchMessages } from '#server/sync';

const defaultStandardTaxonomy = {
  'Income': [
    'Paycheck', 'Interest/Dividends', 'Tax Refund', 'Income'
  ],
  'Bills & Utilities': [
    'Rent/Mortgage', 'Electricity', 'Water/Trash', 'Internet/Phone', 'Insurance'
  ],
  'Food & Dining': [
    'Groceries', 'Restaurants', 'Fast Food', 'Coffee Shops'
  ],
  'Transportation': [
    'Gas', 'Parking & Tolls', 'Ride Share', 'Auto Maintenance'
  ],
  'Shopping': [
    'General Merchandise', 'Clothing', 'Electronics', 'Pets', 'Home Supplies'
  ],
  'Entertainment': [
    'Movies & Events', 'Subscriptions', 'Hobbies'
  ],
  'Health & Fitness': [
    'Medical/Dental', 'Pharmacy', 'Fitness'
  ],
  'Education': [
    'Tuition', 'Books & Supplies'
  ],
  'Savings & Investments': [
    'Brokerage', 'Retirement', 'Emergency Fund'
  ],
  'Goals': [
    'Wedding', 'Vacation'
  ],
  'Transfers & Credit Cards': [
    'Credit Card Payment', 'Transfer'
  ]
};

const defaultCspTaxonomy = {
  'Income': ['Income'],
  'Fixed Costs': ['Housing', 'Utilities', 'Insurance', 'Transportation Base', 'Groceries Base', 'Debt'],
  'Investments': ['Retirement', 'Post-Tax Brokerage'],
  'Savings Goals': ['Emergency Fund', 'Wedding', 'Vacation', 'Large Purchases'],
  'Guilt-Free Spending': ['Dining Out', 'Entertainment', 'Subscriptions', 'Shopping'],
  'N/A': ['Ignored']
};

export async function seedCategories() {
  // Phase 1: Deletions
  await batchMessages(async () => {
    // 1. Clear existing CSP categories if empty or replace? 
    // The user wants to pre-populate. We should probably clear everything if it's a seed action.
    const cspCategories = await all<{ id: string }>('SELECT id FROM csp_categories');
    for (const cat of cspCategories) {
      await delete_('csp_categories', cat.id);
    }
    await runQuery('DELETE FROM csp_categories');

    const cspGroups = await all<{ id: string }>('SELECT id FROM csp_category_groups');
    for (const group of cspGroups) {
      await delete_('csp_category_groups', group.id);
    }
    await runQuery('DELETE FROM csp_category_groups');

    await runQuery('UPDATE transactions SET csp_category = NULL');

    // 2. Clear existing standard categories
    const stdCategories = await all<{ id: string }>('SELECT id FROM categories');
    for (const cat of stdCategories) {
      await delete_('categories', cat.id);
      await runQuery('UPDATE categories SET tombstone = 1 WHERE id = ?', [cat.id]);
    }

    const stdGroups = await all<{ id: string }>('SELECT id FROM category_groups');
    for (const group of stdGroups) {
      await delete_('category_groups', group.id);
      await runQuery('UPDATE category_groups SET tombstone = 1 WHERE id = ?', [group.id]);
    }

    await runQuery('UPDATE transactions SET category = NULL');
  });

  // Phase 2: Insertions
  await batchMessages(async () => {
    // Insert CSP Taxonomy
    let groupSort = 0;
    for (const [groupName, categories] of Object.entries(defaultCspTaxonomy)) {
      const groupId = await insertWithUUID('csp_category_groups', {
        name: groupName,
        sort_order: groupSort,
      });
      groupSort += SORT_INCREMENT;

      let catSort = 0;
      for (const catName of categories) {
        await insertWithUUID('csp_categories', {
          name: catName,
          cat_group: groupId,
          sort_order: catSort,
        });
        catSort += SORT_INCREMENT;
      }
    }

    let standardGroupSort = 0;
    for (const [groupName, categories] of Object.entries(defaultStandardTaxonomy)) {
      const groupId = await insertCategoryGroup({
        name: groupName,
        is_income: groupName === 'Income' ? 1 : 0,
      });

      for (const catName of categories) {
        await insertCategory({
          name: catName,
          cat_group: groupId,
          is_income: groupName === 'Income' ? 1 : 0,
        });
      }
    }
  });

  return { success: true };
}
