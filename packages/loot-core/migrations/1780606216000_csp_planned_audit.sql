BEGIN TRANSACTION;

ALTER TABLE csp_categories ADD COLUMN planned_amount INTEGER;
ALTER TABLE csp_categories ADD COLUMN audit_window_months INTEGER;

COMMIT;
