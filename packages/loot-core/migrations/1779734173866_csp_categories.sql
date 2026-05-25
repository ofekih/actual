CREATE TABLE csp_category_groups
   (id TEXT PRIMARY KEY,
    name TEXT UNIQUE,
    sort_order REAL,
    tombstone INTEGER DEFAULT 0);

CREATE TABLE csp_categories
 (id TEXT PRIMARY KEY,
  name TEXT,
  cat_group TEXT,
  sort_order REAL,
  tombstone INTEGER DEFAULT 0);

ALTER TABLE transactions ADD COLUMN csp_category TEXT;
