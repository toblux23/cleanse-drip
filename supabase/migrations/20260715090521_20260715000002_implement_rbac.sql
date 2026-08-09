/*
# Implement Role-Based Access Control (RBAC)

## Summary
Replaces the hardcoded `role: 'superadmin' | 'member'` field on `team_members`
with a flexible role system backed by lookup tables. Roles are stored in a
`roles` table, permissions in a `permissions` table, and the mapping in a
`role_permissions` junction table. A `has_permission()` SQL function checks
whether the current authenticated user has a given permission.

## New Tables
- `roles` (id, key, label, description, is_system, created_at)
- `permissions` (id, key, label, description, created_at)
- `role_permissions` (role_id, permission_id) — junction table

## Modified Tables
- `team_members.role`: CHECK constraint dropped, FK added to `roles.key`
  Existing 'member' values migrated to 'staff'.

## Seeded Data
- 3 roles: superadmin, nurse, staff
- 14 permissions covering all management/delete actions
- superadmin gets ALL permissions; nurse gets nurse.view

## New Functions
- `has_permission(perm_key)` — checks current user's role for a permission
- `change_member_role(member_user_id, new_role_key)` — changes a member's role

## Updated Functions
- `handle_new_user()` — defaults to 'staff' role instead of 'member'
- `approve_member`, `reject_member`, `revoke_member` — use has_permission('team.manage')

## RLS Policy Updates
All policies that checked `role = 'superadmin'` now use `has_permission()`.
New tables get SELECT-only policies for authenticated users.

## Important Notes
1. The team_members_role_check constraint is dropped to allow new role values.
2. Existing 'member' rows are updated to 'staff' before the FK is added.
3. has_permission is SECURITY DEFINER to avoid RLS recursion.
*/

-- ─── Drop the old CHECK constraint on team_members.role ──────────────────────

ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;

-- ─── Roles table ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS roles (
  id serial PRIMARY KEY,
  key text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ─── Permissions table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS permissions (
  id serial PRIMARY KEY,
  key text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- ─── Role-permissions junction ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id int NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id int NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ─── Seed roles ──────────────────────────────────────────────────────────────

INSERT INTO roles (key, label, description, is_system) VALUES
  ('superadmin', 'Superadmin', 'Full system access including all management features', true),
  ('nurse', 'Nurse', 'Nurse dashboard, appointment workflow, and attendance', true),
  ('staff', 'Staff', 'Standard staff access to bookings, feedback, and client profiles', true)
ON CONFLICT (key) DO NOTHING;

-- ─── Seed permissions ───────────────────────────────────────────────────────

INSERT INTO permissions (key, label, description) VALUES
  ('team.manage', 'Manage Team', 'Approve, reject, revoke, and change roles of team members'),
  ('settings.manage', 'Manage Settings', 'Access the settings tab and configure roles/permissions'),
  ('bookings.delete', 'Delete Bookings', 'Permanently delete booking records'),
  ('appointments.delete', 'Delete Appointments', 'Permanently delete appointment records'),
  ('finance.manage', 'Manage Finance', 'Delete finance transactions'),
  ('billing.delete', 'Delete Billing Records', 'Delete orders and payment records'),
  ('inventory.delete', 'Delete Inventory', 'Delete inventory items'),
  ('documents.delete', 'Delete Documents', 'Delete client documents'),
  ('attendance.delete', 'Delete Attendance', 'Delete time log records'),
  ('qr.manage', 'Manage QR Codes', 'Create, edit, and delete QR sources'),
  ('branches.delete', 'Delete Branches', 'Permanently delete branch records'),
  ('clients.delete', 'Delete Clients', 'Permanently delete client records'),
  ('packages.delete', 'Delete Packages', 'Permanently delete service packages'),
  ('nurse.view', 'View Nurse Dashboard', 'Access the nurse dashboard tab')
ON CONFLICT (key) DO NOTHING;

-- ─── Seed role_permissions ───────────────────────────────────────────────────
-- superadmin gets ALL permissions

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'superadmin'
ON CONFLICT DO NOTHING;

-- nurse gets nurse.view

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.key = 'nurse' AND p.key = 'nurse.view'
ON CONFLICT DO NOTHING;

-- ─── Migrate existing 'member' roles to 'staff' ──────────────────────────────

UPDATE team_members SET role = 'staff' WHERE role = 'member';

-- ─── Add FK constraint from team_members.role → roles.key ────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'team_members_role_fkey' AND table_name = 'team_members'
  ) THEN
    ALTER TABLE team_members
      ADD CONSTRAINT team_members_role_fkey
      FOREIGN KEY (role) REFERENCES roles(key) ON DELETE RESTRICT;
  END IF;
END $$;

-- ─── has_permission() function ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION has_permission(perm_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM team_members tm
    JOIN roles r ON r.key = tm.role
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE tm.user_id = auth.uid()
      AND tm.status = 'approved'
      AND p.key = perm_key
  );
$$;

-- ─── Update handle_new_user() trigger ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO team_members (user_id, email, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    CASE WHEN NEW.email = 'richard@startuplab.ph' THEN 'superadmin' ELSE 'staff' END,
    CASE WHEN NEW.email = 'richard@startuplab.ph' THEN 'approved' ELSE 'pending' END
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ─── Update approve_member() ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION approve_member(member_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission('team.manage') THEN
    RAISE EXCEPTION 'Permission denied: team.manage required';
  END IF;
  UPDATE team_members
  SET status = 'approved', approved_by = auth.uid(), approved_at = now()
  WHERE user_id = member_user_id;
END;
$$;

-- ─── Update reject_member() ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reject_member(member_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission('team.manage') THEN
    RAISE EXCEPTION 'Permission denied: team.manage required';
  END IF;
  UPDATE team_members
  SET status = 'rejected', approved_by = null, approved_at = null
  WHERE user_id = member_user_id;
END;
$$;

-- ─── Update revoke_member() ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION revoke_member(member_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission('team.manage') THEN
    RAISE EXCEPTION 'Permission denied: team.manage required';
  END IF;
  IF member_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot revoke your own access';
  END IF;
  UPDATE team_members
  SET status = 'rejected', approved_by = null, approved_at = null
  WHERE user_id = member_user_id;
END;
$$;

-- ─── New: change_member_role() ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION change_member_role(member_user_id uuid, new_role_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission('team.manage') THEN
    RAISE EXCEPTION 'Permission denied: team.manage required';
  END IF;
  IF member_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM roles WHERE key = new_role_key) THEN
    RAISE EXCEPTION 'Invalid role key: %', new_role_key;
  END IF;
  UPDATE team_members SET role = new_role_key WHERE user_id = member_user_id;
END;
$$;

-- ─── Update RLS policies that checked role = 'superadmin' ─────────────────────

-- finance_transactions: UPDATE + DELETE
DROP POLICY IF EXISTS "team_update_finance" ON finance_transactions;
CREATE POLICY "team_update_finance" ON finance_transactions FOR UPDATE
  TO authenticated
  USING (has_permission('finance.manage'))
  WITH CHECK (has_permission('finance.manage'));

DROP POLICY IF EXISTS "team_delete_finance" ON finance_transactions;
CREATE POLICY "team_delete_finance" ON finance_transactions FOR DELETE
  TO authenticated
  USING (has_permission('finance.manage'));

-- branches: DELETE
DROP POLICY IF EXISTS "superadmin_delete_branches" ON branches;
CREATE POLICY "team_delete_branches" ON branches FOR DELETE
  TO authenticated
  USING (has_permission('branches.delete'));

-- clients: DELETE
DROP POLICY IF EXISTS "superadmin_delete_clients" ON clients;
CREATE POLICY "team_delete_clients" ON clients FOR DELETE
  TO authenticated
  USING (has_permission('clients.delete'));

-- appointments: DELETE
DROP POLICY IF EXISTS "superadmin_delete_appointments" ON appointments;
CREATE POLICY "team_delete_appointments" ON appointments FOR DELETE
  TO authenticated
  USING (has_permission('appointments.delete'));

-- packages: DELETE
DROP POLICY IF EXISTS "superadmin_delete_packages" ON packages;
CREATE POLICY "team_delete_packages" ON packages FOR DELETE
  TO authenticated
  USING (has_permission('packages.delete'));

-- orders: DELETE
DROP POLICY IF EXISTS "superadmin_delete_orders" ON orders;
CREATE POLICY "team_delete_orders" ON orders FOR DELETE
  TO authenticated
  USING (has_permission('billing.delete'));

-- payments: DELETE (superadmin-only one; the appointment_id one stays as-is)
DROP POLICY IF EXISTS "superadmin_delete_payments" ON payments;
CREATE POLICY "team_delete_payments" ON payments FOR DELETE
  TO authenticated
  USING (has_permission('billing.delete'));

-- notification_settings: DELETE
DROP POLICY IF EXISTS "notif_settings_delete" ON notification_settings;
CREATE POLICY "notif_delete_settings" ON notification_settings FOR DELETE
  TO authenticated
  USING (has_permission('team.manage'));

-- storage.objects: finance-receipts bucket DELETE
DROP POLICY IF EXISTS "superadmin_delete_finance_receipts" ON storage.objects;
CREATE POLICY "team_delete_finance_receipts" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'finance-receipts' AND has_permission('finance.manage'));

-- ─── RLS for new tables ────────────────────────────────────────────────────────

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_roles" ON roles;
CREATE POLICY "auth_select_roles" ON roles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_select_permissions" ON permissions;
CREATE POLICY "auth_select_permissions" ON permissions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_select_role_permissions" ON role_permissions;
CREATE POLICY "auth_select_role_permissions" ON role_permissions FOR SELECT
  TO authenticated USING (true);
