DROP VIEW IF EXISTS v_csp_categories;
ALTER TABLE csp_categories RENAME COLUMN audit_window_months TO moving_average_months;
