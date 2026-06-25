import type { CSPCategoryGroupEntity } from './csp-category-group';

export type CSPCategoryEntity = {
  id: string;
  name: string;
  group: CSPCategoryGroupEntity['id'];
  planned_amount?: number | null;
  moving_average_months?: number | null;
  sort_order?: number;
  tombstone?: boolean;
};
