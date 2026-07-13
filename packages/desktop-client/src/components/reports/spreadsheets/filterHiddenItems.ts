import { isCategoryGroup } from '#components/reports/ReportOptions';
import type {
  QueryDataEntity,
  UncategorizedEntity,
} from '#components/reports/ReportOptions';

export function filterHiddenItems(
  item: UncategorizedEntity,
  data: QueryDataEntity[],
  showOffBudget?: boolean,
  showHiddenCategories?: boolean,
  showUncategorized?: boolean,
  groupByLabel?: string,
) {
  const showHide = data
    .filter(
      e =>
        showHiddenCategories ||
        (e.categoryHidden === false && e.categoryGroupHidden === false),
    )
    .filter(e => showOffBudget || e.accountOffBudget === false)
    .filter(
      e =>
        showUncategorized || e.category !== null || e.accountOffBudget === true,
    );

  const groupsByCategory = isCategoryGroup(groupByLabel);

  return showHide.filter(query => {
    if (!groupsByCategory) return true;

    const isCsp =
      groupByLabel === 'cspCategory' || groupByLabel === 'cspCategoryGroup';
    const hasCategory = isCsp ? !!query.cspCategory : !!query.category;
    const isOffBudget = query.accountOffBudget;
    const isTransfer = !!query.transferAccount;

    if (hasCategory && !isOffBudget) {
      return item.uncategorized_id == null;
    }

    switch (item.uncategorized_id) {
      case 'off_budget':
        return isOffBudget;
      case 'transfer':
        return isTransfer && !isOffBudget;
      case 'other':
        return !isOffBudget && !isTransfer;
      case 'all':
        return true;
      default:
        return false;
    }
  });
}
