import type { CSPCategoryEntity } from './csp-category';

export type CSPCategoryGroupEntity = {
  id: string;
  name: string;
  sort_order?: number;
  tombstone?: boolean;
  categories?: CSPCategoryEntity[];
};
