import type { CSPCategoryGroupEntity } from './csp-category-group';

export type CSPCategoryEntity = {
  id: string;
  name: string;
  group: CSPCategoryGroupEntity['id'];
  sort_order?: number;
  tombstone?: boolean;
};
