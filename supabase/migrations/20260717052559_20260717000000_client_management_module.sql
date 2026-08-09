/*
# Client Management Module — Feature Toggle + Permissions

## Purpose
Adds a feature-settings table to persistently control the Client Management module,
adds an updated_at audit timestamp to the existing clients table, and introduces
two new RBAC permissions (clients.view, clients.manage) that gate access to the
new module. The existing clients table is reused as the client master list — no
new client table is created.

## 1. New Tables
- `feature_settings`
  - `id` uuid primary key
  - `key` text unique not null — the feature toggle key (e.g. 'client_management')
  - `enabled` boolean not null default false
  - `updated_at` timestamptz default now()
  - `updated_by` uuid nullable (auth uid of the admin who toggled it)

## 2. Modified Tables
- `clients` — add `updated_at timestamptz DEFAULT now()` for audit timestamps.
  The existing columns (id, full_name, email, phone, address, health_notes,
  status, created_at) are unchanged. No columns are dropped or renamed.

## 3. Security
- `feature_settings` — RLS enabled.
  - SELECT: any authenticated team member can read whether a feature is on
    (needed to decide which nav items to show).
  - INSERT/UPDATE/DELETE: only users with the `settings.manage` permission
    (via the existing has_permission helper) can modify feature toggles.
  - DELETE is allowed but will not be used by the app.
- `clients` — existing RLS policies are untouched. The existing UPDATE policy
  already requires an approved team member, which covers the new edit flow.
  A new tighter INSERT policy is added: only approved team members may add
  clients (the current insert policy is open to all authenticated, which is
  acceptable but we tighten it for the management module). The old open insert
  policy is dropped to avoid a conflict.

## 4. New Permissions
- `clients.view` — View the Client Management module and client list.
- `clients.manage` — Add and update client master records.
- Both are granted to the superadmin role by default.

## 5. Important Notes
1. The existing `clients.delete` permission (id 12) is unchanged and not used
   by this module — no delete capability is added.
2. The existing clients table is the master record; Client Profiles (derived
   from client_bookings) is not modified.
3. No seed/demo client rows are inserted.
4. The migration is idempotent — safe to re-run.
*/

-- ─── feature_settings table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);

ALTER TABLE feature_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_select_feature_settings" ON feature_settings;
CREATE POLICY "team_select_feature_settings" ON feature_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "settings_manage_insert_feature_settings" ON feature_settings;
CREATE POLICY "settings_manage_insert_feature_settings" ON feature_settings FOR INSERT
  TO authenticated WITH CHECK (has_permission('settings.manage'::text));

DROP POLICY IF EXISTS "settings_manage_update_feature_settings" ON feature_settings;
CREATE POLICY "settings_manage_update_feature_settings" ON feature_settings FOR UPDATE
  TO authenticated USING (has_permission('settings.manage'::text))
  WITH CHECK (has_permission('settings.manage'::text));

DROP POLICY IF EXISTS "settings_manage_delete_feature_settings" ON feature_settings;
CREATE POLICY "settings_manage_delete_feature_settings" ON feature_settings FOR DELETE
  TO authenticated USING (has_permission('settings.manage'::text));

-- ─── clients.updated_at ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE clients ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- ─── Tighten clients INSERT to approved team members ────────────────────────
-- The existing open insert policy is replaced so only approved staff can add
-- clients through the management module. This does not affect the booking
-- flow (bookings go to client_bookings, not clients).
DROP POLICY IF EXISTS "team_insert_clients" ON clients;
CREATE POLICY "team_insert_clients" ON clients FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
        AND team_members.status = 'approved'
    )
  );

-- ─── New RBAC permissions ───────────────────────────────────────────────────
INSERT INTO permissions (key, label, description)
VALUES
  ('clients.view', 'View Clients', 'Access the Client Management module and view the client master list'),
  ('clients.manage', 'Manage Clients', 'Add and update client master records')
ON CONFLICT (key) DO NOTHING;

-- Grant both new permissions to the superadmin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'superadmin'
  AND p.key IN ('clients.view', 'clients.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── Default feature toggle: disabled ───────────────────────────────────────
INSERT INTO feature_settings (key, enabled)
VALUES ('client_management', false)
ON CONFLICT (key) DO NOTHING;
