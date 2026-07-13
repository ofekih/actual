import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import type { GroupedEntity } from '@actual-app/core/types/models';

import {
  categoryLists,
  cspCategoryLists,
  ReportOptions,
} from '#components/reports/ReportOptions';
import type { QueryDataEntity } from '#components/reports/ReportOptions';
import type { useSpreadsheet } from '#hooks/useSpreadsheet';

import type { createCustomSpreadsheetProps } from './custom-spreadsheet';
import { fetchSpreadsheetQueryData } from './fetchSpreadsheetQueryData';
import { filterEmptyRows } from './filterEmptyRows';
import { recalculate } from './recalculate';
import { sortData } from './sortData';
import {
  determineIntervalRange,
  trimGroupedDataIntervals,
} from './trimIntervals';

export function createGroupedSpreadsheet({
  startDate,
  endDate,
  interval,
  categories,
  budgetType = 'envelope',
  conditions = [],
  conditionsOp,
  showEmpty,
  showOffBudget,
  showHiddenCategories,
  showUncategorized,
  trimIntervals,
  balanceTypeOp,
  sortByOp,
  firstDayOfWeekIdx,
  groupBy = '',
  cspCategories = { list: [], grouped: [] },
}: createCustomSpreadsheetProps) {
  const [, categoryGroup] = categoryLists(categories);
  const [, cspCategoryGroup] = cspCategoryLists(cspCategories);

  const groupList = groupBy === 'CspGroup' ? cspCategoryGroup : categoryGroup;
  const childGroupByLabel =
    groupBy === 'CspGroup' ? ('cspCategory' as const) : ('category' as const);
  const groupGroupByLabel =
    groupBy === 'CspGroup'
      ? ('cspCategoryGroup' as const)
      : ('categoryGroup' as const);

  return async (
    spreadsheet: ReturnType<typeof useSpreadsheet>,
    setData: (data: GroupedEntity[]) => void,
  ) => {
    if (groupList.length === 0) {
      setData([]);
      return;
    }

    const { filters } = await send('make-filters-from-conditions', {
      conditions: conditions.filter(cond => !cond.customName),
    });
    const conditionsOpKey = conditionsOp === 'or' ? '$or' : '$and';

    let assets: QueryDataEntity[];
    let debts: QueryDataEntity[];

    ({ assets, debts } = await fetchSpreadsheetQueryData({
      balanceTypeOp,
      startDate,
      endDate,
      interval,
      categories: categories.list,
      categoryGroups: categories.grouped,
      conditions,
      conditionsOp,
      conditionsOpKey,
      filters,
      budgetType,
    }));

    if (interval === 'Weekly' && balanceTypeOp !== 'totalBudgeted') {
      debts = debts.map(d => {
        return {
          ...d,
          date: monthUtils.weekFromDate(d.date, firstDayOfWeekIdx),
        };
      });
      assets = assets.map(d => {
        return {
          ...d,
          date: monthUtils.weekFromDate(d.date, firstDayOfWeekIdx),
        };
      });
    }

    const intervals =
      interval === 'Weekly'
        ? monthUtils.weekRangeInclusive(startDate, endDate, firstDayOfWeekIdx)
        : monthUtils[
            ReportOptions.intervalRange.get(interval) || 'rangeInclusive'
          ](startDate, endDate);

    const groupedData: GroupedEntity[] = groupList.map(
      group => {
        const grouped = recalculate({
          item: group,
          intervals,
          assets,
          debts,
          groupByLabel: groupGroupByLabel,
          showOffBudget,
          showHiddenCategories,
          showUncategorized,
          startDate,
          endDate,
        });

        const stackedCategories =
          group.categories &&
          group.categories.map(item => {
            const calc = recalculate({
              item,
              intervals,
              assets,
              debts,
              groupByLabel: childGroupByLabel,
              showOffBudget,
              showHiddenCategories,
              showUncategorized,
              startDate,
              endDate,
            });
            return { ...calc };
          });

        return {
          ...grouped,
          categories:
            stackedCategories &&
            stackedCategories.filter(i =>
              filterEmptyRows({ showEmpty, data: i, balanceTypeOp }),
            ),
        };
      },
      [startDate, endDate],
    );

    const groupedDataFiltered = groupedData.filter(i =>
      filterEmptyRows({ showEmpty, data: i, balanceTypeOp }),
    );

    // Determine interval range across all groups and their nested categories
    const allGroupsForTrimming: GroupedEntity[] = [];
    groupedDataFiltered.forEach(group => {
      allGroupsForTrimming.push(group);
      if (group.categories) {
        allGroupsForTrimming.push(...group.categories);
      }
    });

    const { startIndex, endIndex } = determineIntervalRange(
      allGroupsForTrimming,
      groupedDataFiltered.length > 0 ? groupedDataFiltered[0].intervalData : [],
      trimIntervals,
      balanceTypeOp,
    );

    // Trim all groupedData intervals (including nested categories) based on the range
    trimGroupedDataIntervals(groupedDataFiltered, startIndex, endIndex);

    const sortedGroupedDataFiltered = [...groupedDataFiltered]
      .sort(sortData({ balanceTypeOp, sortByOp }))
      .map(g => {
        g.categories = [...(g.categories ?? [])].sort(
          sortData({ balanceTypeOp, sortByOp }),
        );
        return g;
      });

    setData(sortedGroupedDataFiltered);
  };
}
