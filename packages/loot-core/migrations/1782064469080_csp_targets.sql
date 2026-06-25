CREATE TABLE csp_targets (
  id TEXT PRIMARY KEY,
  month INTEGER,
  category TEXT,
  amount INTEGER,
  tombstone INTEGER DEFAULT 0
);
