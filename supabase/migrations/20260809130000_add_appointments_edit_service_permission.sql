/*
# Add appointments.edit_service permission

## Purpose
Clients change their mind on site. The nurse or assistant needs to correct the
availed service from the appointment details screen without routing back through
an admin.

`operations.manage` is not reusable here — it is scoped to operational tasks and
errands (see 20260724000000_create_operational_tasks), not to appointments.
This introduces a dedicated permission so the capability can be granted to
clinical staff without also granting errand management.

## Changes
- Insert permission `appointments.edit_service`
- Grant it to: superadmin, nurse, nurse_assistant, head_clinical_ops

## Notes
- Roles are looked up by key and skipped if absent, so this is safe on projects
  where a role has not been seeded.
- Idempotent: ON CONFLICT DO NOTHING on both the permission and the grants.
- `staff` and `booking_staff` are deliberately excluded. Changing the availed
  service changes what is deducted from inventory and what the client is billed;
  it is a clinical decision made at the bedside.
*/

INSERT INTO permissions (key, label, description)
SELECT 'appointments.edit_service', 'Edit Availed Service', 'Change the service on an appointment from the details screen'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'appointments.edit_service');

DO $$
DECLARE
  v_perm_id int;
  v_role_id int;
  v_role_key text;
BEGIN
  SELECT id INTO v_perm_id FROM permissions WHERE key = 'appointments.edit_service';
  IF v_perm_id IS NULL THEN
    RAISE EXCEPTION 'appointments.edit_service permission was not created';
  END IF;

  FOREACH v_role_key IN ARRAY ARRAY['superadmin', 'nurse', 'nurse_assistant', 'head_clinical_ops']
  LOOP
    SELECT id INTO v_role_id FROM roles WHERE key = v_role_key LIMIT 1;
    IF v_role_id IS NOT NULL THEN
      INSERT INTO role_permissions (role_id, permission_id)
      VALUES (v_role_id, v_perm_id)
      ON CONFLICT DO NOTHING;
    ELSE
      RAISE NOTICE 'Role % not found — skipping grant of appointments.edit_service.', v_role_key;
    END IF;
  END LOOP;
END $$;
