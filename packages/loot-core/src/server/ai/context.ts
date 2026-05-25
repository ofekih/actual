import { q } from '#shared/query';

import { aqlQuery } from '../aql';

export interface TaxonomyContext {
  standard: Array<{
    groupName: string;
    categories: Array<{ id: string; name: string; isIncome: boolean }>;
  }>;
  csp: Array<{
    groupName: string;
    categories: Array<{ id: string; name: string }>;
  }>;
}

export async function getTaxonomies(): Promise<TaxonomyContext> {
  const { data: groups } = (await aqlQuery(q('category_groups').select('*'))) as { data: Array<{ id: string; name: string }> };
  const { data: categories } = (await aqlQuery(q('categories').select('*'))) as { data: Array<{ id: string; name: string; is_income: boolean; group?: string }> };

  const { data: cspGroups } = (await aqlQuery(q('csp_category_groups').select('*'))) as { data: Array<{ id: string; name: string }> };
  const { data: cspCategories } = (await aqlQuery(q('csp_categories').select('*'))) as { data: Array<{ id: string; name: string; group?: string }> };

  const standard = groups.map((g) => ({
    groupName: g.name,
    categories: categories
      .filter((c) => c.group === g.id)
      .map((c) => ({ id: c.id, name: c.name, isIncome: !!c.is_income }))
  }));

  const csp = cspGroups.map((g) => ({
    groupName: g.name,
    categories: cspCategories
      .filter((c) => c.group === g.id)
      .map((c) => ({ id: c.id, name: c.name }))
  }));

  return { standard, csp };
}

export async function getPayeeHistory(payeeId: string) {
  const { data } = await aqlQuery(
    q('transactions')
      .filter({ payee: payeeId, is_parent: false, category: { $ne: null } })
      .orderBy({ date: 'desc' })
      .limit(10)
      .select(['date', 'amount', 'payee.name', 'notes', 'category.name', 'csp_category.name'])
  );
  return data;
}

export async function getAccountHistory(accountId: string) {
  const { data } = await aqlQuery(
    q('transactions')
      .filter({ account: accountId, is_parent: false, category: { $ne: null } })
      .orderBy({ date: 'desc' })
      .limit(10)
      .select(['date', 'amount', 'payee.name', 'notes', 'category.name', 'csp_category.name'])
  );
  return data;
}
