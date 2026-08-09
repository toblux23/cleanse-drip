-- Add catalog.delete permission and grant only to superadmin
INSERT INTO permissions (key, label) VALUES ('catalog.delete', 'Delete Products and Packages')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE r_id int; p_id int;
BEGIN
  SELECT id INTO p_id FROM permissions WHERE key = 'catalog.delete' LIMIT 1;
  SELECT id INTO r_id FROM roles WHERE key = 'superadmin' LIMIT 1;
  IF r_id IS NOT NULL AND p_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id) VALUES (r_id, p_id) ON CONFLICT DO NOTHING;
  END IF;
END $$;