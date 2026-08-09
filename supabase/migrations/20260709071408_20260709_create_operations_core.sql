/*
# Phase 1 — Operations Core: branches, clients, appointments

## Summary
Creates three new tables that power the live Operations status board:
a branch-location lookup, a reusable client directory (separate from
intake-form client_bookings), and a full appointment scheduling + live-
tracking table with a defined status lifecycle.

## New Tables

### branches
Lookup table for operating locations. Seeded with Manila and Palawan.
- `id`         uuid PK
- `name`       text UNIQUE NOT NULL
- `is_active`  boolean DEFAULT true
- `created_at` timestamptz

### clients
Ops-layer client directory. Team members look up or quick-add clients
when creating appointments. Intentionally lightweight — full health intake
still lives in client_bookings.
- `id`           uuid PK
- `full_name`    text NOT NULL
- `email`        text nullable
- `phone`        text nullable
- `address`      text nullable
- `health_notes` text nullable — brief clinical notes for the ops team
- `status`       text DEFAULT 'active'
- `created_at`   timestamptz

### appointments
Core scheduling & live ops tracking table. Each row moves through:
  scheduled → dispatched → arrived → in_treatment → completed (or cancelled)
Status-change timestamps are stamped as the appointment advances.
- `id`                   uuid PK
- `client_id`            uuid FK → clients.id
- `branch_id`            uuid FK → branches.id
- `scheduled_date`       date
- `scheduled_time`       text (HH:MM, e.g. '09:30')
- `location`             text nullable — visit address
- `service`              text nullable — e.g. 'IV Drip Therapy'
- `nurse_name`           text nullable
- `assistant_name`       text nullable
- `driver_name`          text nullable
- `vehicle`              text nullable — plate or description
- `payment_status`       text DEFAULT 'pending' (pending|paid|partial|waived)
- `intake_form_status`   text DEFAULT 'pending' (pending|completed)
- `status`               text DEFAULT 'scheduled'
- `dispatched_at`        timestamptz nullable — stamped on → dispatched
- `arrived_at`           timestamptz nullable — stamped on → arrived
- `treatment_started_at` timestamptz nullable — stamped on → in_treatment
- `completed_at`         timestamptz nullable — stamped on → completed
- `notes`                text nullable
- `created_by_email`     text nullable
- `created_at`           timestamptz

## Indexes
- appointments(scheduled_date) — primary ops board filter
- appointments(branch_id)      — branch filter
- appointments(status)         — status grouping
- appointments(client_id)      — client history

## Security
All three tables mirror the tightened finance_transactions RLS pattern:
- SELECT: all authenticated users
- INSERT: all authenticated users (app layer gates by approved membership)
- UPDATE: approved team members only (team_members.status = 'approved')
- DELETE: superadmin-approved members only (role = 'superadmin' AND status = 'approved')
*/

-- ── 1. branches ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS branches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branches_name_key' AND conrelid = 'branches'::regclass
  ) THEN
    ALTER TABLE branches ADD CONSTRAINT branches_name_key UNIQUE (name);
  END IF;
END $$;

INSERT INTO branches (name) VALUES ('Manila'), ('Palawan') ON CONFLICT (name) DO NOTHING;

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_select_branches"      ON branches;
DROP POLICY IF EXISTS "team_insert_branches"      ON branches;
DROP POLICY IF EXISTS "team_update_branches"      ON branches;
DROP POLICY IF EXISTS "superadmin_delete_branches" ON branches;

CREATE POLICY "team_select_branches" ON branches
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "team_insert_branches" ON branches
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "team_update_branches" ON branches
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'
  ));

CREATE POLICY "superadmin_delete_branches" ON branches
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid()
      AND team_members.role = 'superadmin'
      AND team_members.status = 'approved'
  ));

-- ── 2. clients ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name    text NOT NULL,
  email        text,
  phone        text,
  address      text,
  health_notes text,
  status       text NOT NULL DEFAULT 'active',
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clients_full_name_idx ON clients (full_name);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_select_clients"       ON clients;
DROP POLICY IF EXISTS "team_insert_clients"       ON clients;
DROP POLICY IF EXISTS "team_update_clients"       ON clients;
DROP POLICY IF EXISTS "superadmin_delete_clients" ON clients;

CREATE POLICY "team_select_clients" ON clients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "team_insert_clients" ON clients
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "team_update_clients" ON clients
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'
  ));

CREATE POLICY "superadmin_delete_clients" ON clients
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid()
      AND team_members.role = 'superadmin'
      AND team_members.status = 'approved'
  ));

-- ── 3. appointments ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS appointments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  branch_id            uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  scheduled_date       date NOT NULL,
  scheduled_time       text NOT NULL,
  location             text,
  service              text,
  nurse_name           text,
  assistant_name       text,
  driver_name          text,
  vehicle              text,
  payment_status       text NOT NULL DEFAULT 'pending',
  intake_form_status   text NOT NULL DEFAULT 'pending',
  status               text NOT NULL DEFAULT 'scheduled'
                       CONSTRAINT appointments_status_check
                         CHECK (status IN ('scheduled','dispatched','arrived','in_treatment','completed','cancelled')),
  dispatched_at        timestamptz,
  arrived_at           timestamptz,
  treatment_started_at timestamptz,
  completed_at         timestamptz,
  notes                text,
  created_by_email     text,
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointments_scheduled_date_idx ON appointments (scheduled_date);
CREATE INDEX IF NOT EXISTS appointments_branch_id_idx      ON appointments (branch_id);
CREATE INDEX IF NOT EXISTS appointments_status_idx         ON appointments (status);
CREATE INDEX IF NOT EXISTS appointments_client_id_idx      ON appointments (client_id);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_select_appointments"       ON appointments;
DROP POLICY IF EXISTS "team_insert_appointments"       ON appointments;
DROP POLICY IF EXISTS "team_update_appointments"       ON appointments;
DROP POLICY IF EXISTS "superadmin_delete_appointments" ON appointments;

CREATE POLICY "team_select_appointments" ON appointments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "team_insert_appointments" ON appointments
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "team_update_appointments" ON appointments
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'
  ));

CREATE POLICY "superadmin_delete_appointments" ON appointments
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid()
      AND team_members.role = 'superadmin'
      AND team_members.status = 'approved'
  ));
