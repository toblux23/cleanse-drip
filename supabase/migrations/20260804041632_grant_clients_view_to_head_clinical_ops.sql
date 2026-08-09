-- Grant clients.view permission to head_clinical_ops role
-- This allows Head of Clinical Operations to view client consent records
-- (RLS policy on client_consent_records requires nurse.view OR clients.view)

INSERT INTO role_permissions (role_id, permission_id)
SELECT 6, 15
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions WHERE role_id = 6 AND permission_id = 15
);
