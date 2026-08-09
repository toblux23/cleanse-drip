-- Grant nurse_assistant.view permission to superadmin role
-- so superadmin can see and access the Nurse Assistant dashboard
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.key = 'superadmin' AND p.key = 'nurse_assistant.view'
ON CONFLICT DO NOTHING;
