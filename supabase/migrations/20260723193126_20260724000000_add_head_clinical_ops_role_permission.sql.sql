-- Add Head of Clinical Operations role and its view permission.
-- No new tables; only INSERTs into existing roles / permissions / role_permissions.

INSERT INTO roles (key, label, description, is_system)
VALUES ('head_clinical_ops', 'Head of Clinical Operations', 'Executive oversight of clinical operations, sales, payments, and reports', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO permissions (key, label, description)
VALUES ('head_clinical_ops.view', 'View Head of Clinical Operations Dashboard', 'Access the Head of Clinical Operations executive dashboard')
ON CONFLICT (key) DO NOTHING;

-- Grant head_clinical_ops.view to the head_clinical_ops role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.key = 'head_clinical_ops' AND p.key = 'head_clinical_ops.view'
ON CONFLICT DO NOTHING;

-- Also grant head_clinical_ops.view to superadmin so admins can see it too
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.key = 'superadmin' AND p.key = 'head_clinical_ops.view'
ON CONFLICT DO NOTHING;
