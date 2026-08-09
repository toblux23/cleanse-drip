/*
# Phase 4 – Attendance, Inventory, and Documents Tables

## Summary
Adds three new operational modules to the IV-drip management system.

## New Tables

### 1. time_logs – Staff Attendance / Time Tracking
- id (uuid, PK)
- team_member_id (uuid, nullable FK → team_members)
- staff_name (text) – free-text fallback when no team member record exists
- branch_id (uuid, nullable FK → branches)
- clock_in (timestamptz) – required shift start timestamp
- clock_out (timestamptz, nullable) – shift end; null means currently clocked in
- notes (text, nullable)
- created_at (timestamptz default now())
Indexes: branch_id, clock_in

### 2. inventory_items – Consumable Stock Catalogue
- id (uuid, PK)
- name (text, not null) – item name, e.g. "Normal Saline 500ml"
- category (text, nullable) – e.g. "IV Solutions", "Medications"
- unit (text, default 'unit') – e.g. "vial", "bag", "box"
- current_stock (numeric, default 0)
- reorder_level (numeric, default 0) – alert threshold
- branch_id (uuid, nullable FK → branches)
- is_active (boolean, default true)
- created_at (timestamptz default now())

### 3. inventory_usage – Per-appointment Consumption Log
- id (uuid, PK)
- inventory_item_id (uuid, FK → inventory_items ON DELETE CASCADE)
- appointment_id (uuid, nullable FK → appointments)
- quantity (numeric, not null) – units consumed
- used_at (timestamptz, default now())
- recorded_by (uuid, nullable)
- notes (text, nullable)
Indexes: inventory_item_id, used_at

### 4. documents – Client Waivers & Consent Forms
- id (uuid, PK)
- client_id (uuid, nullable FK → clients)
- appointment_id (uuid, nullable FK → appointments)
- doc_type (text, default 'waiver', CHECK IN ('waiver','consent','profile','other'))
- title (text, nullable)
- content (text, nullable) – free-text body of the document
- status (text, default 'draft', CHECK IN ('draft','signed','archived'))
- created_at (timestamptz default now())
- created_by (uuid, nullable)
Index: client_id

## Security
- RLS enabled on all four tables.
- SELECT + INSERT: approved authenticated team members (via team_members join).
- UPDATE: approved authenticated team members.
- DELETE: approved superadmins only.
- Mirrors the pattern from team_members / finance_transactions.
*/

-- ─── time_logs ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS time_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id    uuid REFERENCES team_members(id) ON DELETE SET NULL,
  staff_name        text,
  branch_id         uuid REFERENCES branches(id) ON DELETE SET NULL,
  clock_in          timestamptz NOT NULL,
  clock_out         timestamptz,
  notes             text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS time_logs_branch_id_idx ON time_logs (branch_id);
CREATE INDEX IF NOT EXISTS time_logs_clock_in_idx  ON time_logs (clock_in);

ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "time_logs_select"  ON time_logs;
DROP POLICY IF EXISTS "time_logs_insert"  ON time_logs;
DROP POLICY IF EXISTS "time_logs_update"  ON time_logs;
DROP POLICY IF EXISTS "time_logs_delete"  ON time_logs;

CREATE POLICY "time_logs_select" ON time_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  );

CREATE POLICY "time_logs_insert" ON time_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  );

CREATE POLICY "time_logs_update" ON time_logs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  );

CREATE POLICY "time_logs_delete" ON time_logs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
        AND tm.role = 'superadmin'
    )
  );

-- ─── inventory_items ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  category       text,
  unit           text DEFAULT 'unit',
  current_stock  numeric DEFAULT 0,
  reorder_level  numeric DEFAULT 0,
  branch_id      uuid REFERENCES branches(id) ON DELETE SET NULL,
  is_active      boolean DEFAULT true,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_items_select"  ON inventory_items;
DROP POLICY IF EXISTS "inventory_items_insert"  ON inventory_items;
DROP POLICY IF EXISTS "inventory_items_update"  ON inventory_items;
DROP POLICY IF EXISTS "inventory_items_delete"  ON inventory_items;

CREATE POLICY "inventory_items_select" ON inventory_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  );

CREATE POLICY "inventory_items_insert" ON inventory_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  );

CREATE POLICY "inventory_items_update" ON inventory_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  );

CREATE POLICY "inventory_items_delete" ON inventory_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
        AND tm.role = 'superadmin'
    )
  );

-- ─── inventory_usage ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_usage (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id   uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  appointment_id      uuid REFERENCES appointments(id) ON DELETE SET NULL,
  quantity            numeric NOT NULL,
  used_at             timestamptz DEFAULT now(),
  recorded_by         uuid,
  notes               text
);

CREATE INDEX IF NOT EXISTS inventory_usage_item_idx   ON inventory_usage (inventory_item_id);
CREATE INDEX IF NOT EXISTS inventory_usage_used_at_idx ON inventory_usage (used_at);

ALTER TABLE inventory_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_usage_select"  ON inventory_usage;
DROP POLICY IF EXISTS "inventory_usage_insert"  ON inventory_usage;
DROP POLICY IF EXISTS "inventory_usage_update"  ON inventory_usage;
DROP POLICY IF EXISTS "inventory_usage_delete"  ON inventory_usage;

CREATE POLICY "inventory_usage_select" ON inventory_usage FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  );

CREATE POLICY "inventory_usage_insert" ON inventory_usage FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  );

CREATE POLICY "inventory_usage_update" ON inventory_usage FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  );

CREATE POLICY "inventory_usage_delete" ON inventory_usage FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
        AND tm.role = 'superadmin'
    )
  );

-- ─── documents ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid REFERENCES clients(id) ON DELETE SET NULL,
  appointment_id   uuid REFERENCES appointments(id) ON DELETE SET NULL,
  doc_type         text DEFAULT 'waiver' CHECK (doc_type IN ('waiver','consent','profile','other')),
  title            text,
  content          text,
  status           text DEFAULT 'draft' CHECK (status IN ('draft','signed','archived')),
  created_at       timestamptz DEFAULT now(),
  created_by       uuid
);

CREATE INDEX IF NOT EXISTS documents_client_id_idx ON documents (client_id);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documents_select"  ON documents;
DROP POLICY IF EXISTS "documents_insert"  ON documents;
DROP POLICY IF EXISTS "documents_update"  ON documents;
DROP POLICY IF EXISTS "documents_delete"  ON documents;

CREATE POLICY "documents_select" ON documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  );

CREATE POLICY "documents_insert" ON documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  );

CREATE POLICY "documents_update" ON documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  );

CREATE POLICY "documents_delete" ON documents FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
        AND tm.role = 'superadmin'
    )
  );
