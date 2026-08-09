/*
# Nurse Assistant Role and Booking Assignment Fields

1. Purpose
   Adds a new "nurse_assistant" role to the RBAC system with a dedicated
   "nurse_assistant.view" permission, and adds two columns to client_bookings
   so bookings can be assigned to a nurse assistant and tracked through
   assistant-specific statuses.

2. New RBAC Entries
   - Role: `nurse_assistant` (label: "Nurse Assistant", is_system: true)
   - Permission: `nurse_assistant.view` (label: "View Nurse Assistant Dashboard")
   - Role-permission mapping: nurse_assistant → nurse_assistant.view

3. Modified Tables
   - `client_bookings`
     - `assigned_nurse_assistant_id` (uuid, nullable, FK→team_members.user_id ON DELETE SET NULL)
     - `assistant_status` (text, nullable, CHECK IN ('Assigned','Preparing','Ready','In Progress','Completed'))
       Default: 'Assigned' when set by the application; column itself is nullable so existing rows are unaffected.

4. Security
   - No new tables, so no new RLS policies needed.
   - The new role inherits the existing team_members RLS (SELECT for authenticated, UPDATE for self or team.manage).
   - client_bookings already has open RLS (anon, authenticated) — no policy changes needed.

5. Important Notes
   - Existing client_bookings rows are NOT modified. New columns are nullable.
   - The nurse_assistant role does NOT receive any permissions from other roles.
   - Superadmin retains all permissions via CROSS JOIN seed (already in place).
   - The FK on assigned_nurse_assistant_id mirrors the existing assigned_nurse_id pattern.
*/

-- 1. Add nurse_assistant role (idempotent)
INSERT INTO roles (key, label, description, is_system)
VALUES ('nurse_assistant', 'Nurse Assistant', 'Nurse assistant dashboard with assigned bookings, payments, and daily reports', true)
ON CONFLICT (key) DO NOTHING;

-- 2. Add nurse_assistant.view permission (idempotent)
INSERT INTO permissions (key, label, description)
VALUES ('nurse_assistant.view', 'View Nurse Assistant Dashboard', 'Access the nurse assistant dashboard and manage assigned bookings')
ON CONFLICT (key) DO NOTHING;

-- 3. Map nurse_assistant role → nurse_assistant.view permission (idempotent)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.key = 'nurse_assistant' AND p.key = 'nurse_assistant.view'
ON CONFLICT DO NOTHING;

-- 4. Add assigned_nurse_assistant_id column to client_bookings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_bookings' AND column_name = 'assigned_nurse_assistant_id'
  ) THEN
    ALTER TABLE client_bookings
      ADD COLUMN assigned_nurse_assistant_id uuid
      REFERENCES team_members(user_id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Add assistant_status column to client_bookings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_bookings' AND column_name = 'assistant_status'
  ) THEN
    ALTER TABLE client_bookings
      ADD COLUMN assistant_status text
      CHECK (assistant_status IN ('Assigned','Preparing','Ready','In Progress','Completed'));
  END IF;
END $$;
