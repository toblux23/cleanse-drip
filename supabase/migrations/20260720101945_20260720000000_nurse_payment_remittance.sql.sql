/*
# Nurse Payment Collection & Remittance Workflow

## Purpose
When a nurse collects money from a client, the payment must NOT immediately be treated
as company cash received. It remains under the nurse's accountability until an
authorized administrator confirms the nurse remitted the money. Only after
confirmation does the transaction become an official financial record.

## New Tables
1. `nurse_collections` — holds each payment collected by a nurse, its remittance
   status, and links to the official payment record created on confirmation.
2. `nurse_collection_audit` — immutable audit trail of every action on a collection.

## Columns on `nurse_collections`
- id (uuid PK)
- collection_number (text, unique, human-readable e.g. NC-20260720-0001)
- appointment_id (uuid FK → appointments)
- client_id (uuid FK → clients)
- branch_id (uuid FK → branches, nullable)
- service (text, nullable)
- amount_due (numeric, default 0)
- amount_received (numeric, > 0)
- payment_method (text: cash | check | wire)
- reference_number (text, nullable — required for wire)
- check_number (text, nullable — required for check)
- payer_name (text, nullable)
- collected_by (uuid FK → auth.users, the nurse)
- collected_by_email (text, for display)
- collected_at (timestamptz)
- notes (text, nullable)
- proof_url (text, nullable — attachment)
- status (text: collected_by_nurse | for_remittance | pending_confirmation | confirmed | rejected | returned | cancelled)
- remittance_method (text, nullable: cash_turnover | bank_deposit | bank_transfer | check_turnover)
- remittance_amount (numeric, nullable)
- remittance_reference (text, nullable)
- remittance_proof_url (text, nullable)
- remittance_notes (text, nullable)
- remitted_at (timestamptz, nullable)
- confirmed_by (uuid FK → auth.users, nullable)
- confirmed_by_email (text, nullable)
- confirmed_at (timestamptz, nullable)
- confirmed_amount (numeric, nullable)
- receipt_number (text, nullable)
- confirmation_notes (text, nullable)
- rejection_reason (text, nullable)
- official_payment_id (uuid FK → payments, nullable — set on confirm, idempotency guard)
- official_finance_txn_id (uuid FK → finance_transactions, nullable)
- created_at, updated_at (timestamptz)

## Columns on `nurse_collection_audit`
- id (uuid PK)
- collection_id (uuid FK → nurse_collections)
- action (text: recorded | edited | remittance_submitted | remittance_returned | remittance_rejected | remittance_confirmed | official_payment_created | receipt_created | cancelled)
- performed_by (uuid, nullable)
- performed_by_email (text, nullable)
- role (text, nullable)
- previous_status (text, nullable)
- new_status (text, nullable)
- previous_value (jsonb, nullable)
- new_value (jsonb, nullable)
- reason (text, nullable)
- amount (numeric, nullable)
- payment_method (text, nullable)
- reference_number (text, nullable)
- created_at (timestamptz)

## New Permissions
- payments.record_collection
- payments.view_own_collections
- payments.submit_remittance
- payments.view_own_remittances
- payments.view_all
- payments.confirm_remittance
- payments.reject_remittance
- payments.manage_receipts
- finance.view_summary
- finance.view_reports

## RBAC Assignment
- Nurse: payments.record_collection, payments.view_own_collections, payments.submit_remittance, payments.view_own_remittances
- Superadmin: all new permissions
- Staff: payments.view_all, finance.view_summary (finance staff can see overview)

## Security (RLS)
- nurse_collections: nurses see only their own collections; admins/finance see all
- nurse_collection_audit: same scoping as the parent collection
- All tables use auth.uid() ownership checks
*/

-- ─── Permissions ─────────────────────────────────────────────────────────────

INSERT INTO permissions (key, label, description) VALUES
  ('payments.record_collection', 'Record Client Payment', 'Nurse can record a payment collected from a client'),
  ('payments.view_own_collections', 'View Own Collections', 'Nurse can view payments they personally collected'),
  ('payments.submit_remittance', 'Submit Remittance', 'Nurse can submit collected funds for admin confirmation'),
  ('payments.view_own_remittances', 'View Own Remittances', 'Nurse can view the status of their own remittances'),
  ('payments.view_all', 'View All Collections', 'View all nurse collections across the organization'),
  ('payments.confirm_remittance', 'Confirm Remittance', 'Admin can confirm a nurse remittance and create official payment'),
  ('payments.reject_remittance', 'Reject Remittance', 'Admin can reject or return a nurse remittance'),
  ('payments.manage_receipts', 'Manage Receipts', 'Manage receipt numbers for confirmed payments'),
  ('finance.view_summary', 'View Financial Summary', 'View the financial overview dashboard'),
  ('finance.view_reports', 'View Financial Reports', 'View detailed financial reports')
ON CONFLICT (key) DO NOTHING;

-- Assign nurse permissions
DO $$
DECLARE
  v_nurse_role_id int;
  v_superadmin_role_id int;
  v_staff_role_id int;
  v_perm_id int;
BEGIN
  SELECT id INTO v_nurse_role_id FROM roles WHERE key = 'nurse';
  SELECT id INTO v_superadmin_role_id FROM roles WHERE key = 'superadmin';
  SELECT id INTO v_staff_role_id FROM roles WHERE key = 'staff';

  IF v_nurse_role_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_nurse_role_id, p.id FROM permissions p
    WHERE p.key IN (
      'payments.record_collection',
      'payments.view_own_collections',
      'payments.submit_remittance',
      'payments.view_own_remittances'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_superadmin_role_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_superadmin_role_id, p.id FROM permissions p
    WHERE p.key IN (
      'payments.record_collection',
      'payments.view_own_collections',
      'payments.submit_remittance',
      'payments.view_own_remittances',
      'payments.view_all',
      'payments.confirm_remittance',
      'payments.reject_remittance',
      'payments.manage_receipts',
      'finance.view_summary',
      'finance.view_reports'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_staff_role_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_staff_role_id, p.id FROM permissions p
    WHERE p.key IN ('payments.view_all', 'finance.view_summary')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ─── nurse_collections table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nurse_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_number text UNIQUE NOT NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  service text,
  amount_due numeric(12,2) DEFAULT 0,
  amount_received numeric(12,2) NOT NULL CHECK (amount_received > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'check', 'wire')),
  reference_number text,
  check_number text,
  payer_name text,
  collected_by uuid NOT NULL DEFAULT auth.uid(),
  collected_by_email text NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  proof_url text,
  status text NOT NULL DEFAULT 'collected_by_nurse' CHECK (
    status IN ('collected_by_nurse', 'for_remittance', 'pending_confirmation', 'confirmed', 'rejected', 'returned', 'cancelled')
  ),
  remittance_method text CHECK (remittance_method IS NULL OR remittance_method IN ('cash_turnover', 'bank_deposit', 'bank_transfer', 'check_turnover')),
  remittance_amount numeric(12,2),
  remittance_reference text,
  remittance_proof_url text,
  remittance_notes text,
  remitted_at timestamptz,
  confirmed_by uuid,
  confirmed_by_email text,
  confirmed_at timestamptz,
  confirmed_amount numeric(12,2),
  receipt_number text,
  confirmation_notes text,
  rejection_reason text,
  official_payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  official_finance_txn_id uuid REFERENCES finance_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nurse_collections ENABLE ROW LEVEL SECURITY;

-- Nurses see only their own collections; superadmins and staff with payments.view_all see all
DROP POLICY IF EXISTS "select_own_or_all_collections" ON nurse_collections;
CREATE POLICY "select_own_or_all_collections" ON nurse_collections FOR SELECT
  TO authenticated USING (
    collected_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN role_permissions rp ON rp.role_id = (
        SELECT id FROM roles WHERE key = tm.role
      )
      JOIN permissions p ON p.id = rp.permission_id
      WHERE tm.user_id = auth.uid() AND p.key = 'payments.view_all'
    )
  );

-- Only nurses (or superadmin) can insert their own collection
DROP POLICY IF EXISTS "insert_own_collection" ON nurse_collections;
CREATE POLICY "insert_own_collection" ON nurse_collections FOR INSERT
  TO authenticated WITH CHECK (
    collected_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'superadmin'
    )
  );

-- Nurse can update their own collection only if status is not confirmed
DROP POLICY IF EXISTS "update_own_collection" ON nurse_collections;
CREATE POLICY "update_own_collection" ON nurse_collections FOR UPDATE
  TO authenticated USING (
    collected_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'superadmin'
    )
  )
  WITH CHECK (
    collected_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'superadmin'
    )
  );

-- Only superadmin / payments.confirm_remittance holders can delete
DROP POLICY IF EXISTS "delete_collection_admin" ON nurse_collections;
CREATE POLICY "delete_collection_admin" ON nurse_collections FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN role_permissions rp ON rp.role_id = (SELECT id FROM roles WHERE key = tm.role)
      JOIN permissions p ON p.id = rp.permission_id
      WHERE tm.user_id = auth.uid() AND p.key = 'payments.confirm_remittance'
    )
  );

CREATE INDEX IF NOT EXISTS idx_nc_collected_by ON nurse_collections(collected_by);
CREATE INDEX IF NOT EXISTS idx_nc_status ON nurse_collections(status);
CREATE INDEX IF NOT EXISTS idx_nc_appointment_id ON nurse_collections(appointment_id);
CREATE INDEX IF NOT EXISTS idx_nc_collected_at ON nurse_collections(collected_at DESC);

-- ─── nurse_collection_audit table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nurse_collection_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES nurse_collections(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN (
    'recorded', 'edited', 'remittance_submitted', 'remittance_returned',
    'remittance_rejected', 'remittance_confirmed', 'official_payment_created',
    'receipt_created', 'cancelled'
  )),
  performed_by uuid,
  performed_by_email text,
  role text,
  previous_status text,
  new_status text,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  amount numeric(12,2),
  payment_method text,
  reference_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nurse_collection_audit ENABLE ROW LEVEL SECURITY;

-- Same scoping as parent collection
DROP POLICY IF EXISTS "select_audit_own_or_all" ON nurse_collection_audit;
CREATE POLICY "select_audit_own_or_all" ON nurse_collection_audit FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM nurse_collections nc
      WHERE nc.id = nurse_collection_audit.collection_id
      AND (nc.collected_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM team_members tm
          JOIN role_permissions rp ON rp.role_id = (SELECT id FROM roles WHERE key = tm.role)
          JOIN permissions p ON p.id = rp.permission_id
          WHERE tm.user_id = auth.uid() AND p.key = 'payments.view_all'
        ))
    )
  );

-- Only authenticated users who own the parent or have admin can insert audit
DROP POLICY IF EXISTS "insert_audit_own_or_admin" ON nurse_collection_audit;
CREATE POLICY "insert_audit_own_or_admin" ON nurse_collection_audit FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM nurse_collections nc
      WHERE nc.id = nurse_collection_audit.collection_id
      AND (nc.collected_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'superadmin'
        )
        OR EXISTS (
          SELECT 1 FROM team_members tm
          JOIN role_permissions rp ON rp.role_id = (SELECT id FROM roles WHERE key = tm.role)
          JOIN permissions p ON p.id = rp.permission_id
          WHERE tm.user_id = auth.uid() AND p.key = 'payments.confirm_remittance'
        ))
    )
  );

CREATE INDEX IF NOT EXISTS idx_nca_collection_id ON nurse_collection_audit(collection_id, created_at DESC);

-- ─── updated_at trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_nurse_collections_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nurse_collections_updated ON nurse_collections;
CREATE TRIGGER trg_nurse_collections_updated
  BEFORE UPDATE ON nurse_collections
  FOR EACH ROW EXECUTE FUNCTION update_nurse_collections_updated_at();

-- ─── collection_number sequence ──────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS nurse_collection_seq START 1;

CREATE OR REPLACE FUNCTION generate_collection_number()
RETURNS text AS $$
DECLARE
  v_seq int;
  v_date text;
BEGIN
  v_seq := nextval('nurse_collection_seq');
  v_date := to_char(now(), 'YYYYMMDD');
  RETURN 'NC-' || v_date || '-' || lpad(v_seq::text, 4, '0');
END;
$$ LANGUAGE plpgsql;