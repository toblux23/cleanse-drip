/*
# Finance transactions: add receipt/author fields, tighten RLS, create storage bucket

## Summary
Extends finance_transactions with receipt_url, created_by_email, notes columns;
tightens UPDATE/DELETE to superadmin-only; provisions a private storage bucket
for receipt images with per-verb storage policies.

## Modified Tables — finance_transactions
- `receipt_url`      (text, nullable) — storage path for uploaded receipt image
- `created_by_email` (text, nullable) — email of the team member who logged it
- `notes`            (text, nullable) — optional additional detail
- `category` gets DEFAULT 'General' so omitting it on insert still works

## RLS Changes
UPDATE / DELETE tightened to superadmin-approved team members only.
SELECT / INSERT unchanged (all authenticated users).

## Storage
Creates `finance-receipts` private bucket (10 MB limit, image types).
Adds SELECT/INSERT policies for authenticated users; DELETE for superadmin only.
*/

-- ── 1. Add new columns (idempotent) ─────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='finance_transactions' AND column_name='receipt_url') THEN
    ALTER TABLE finance_transactions ADD COLUMN receipt_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='finance_transactions' AND column_name='created_by_email') THEN
    ALTER TABLE finance_transactions ADD COLUMN created_by_email text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='finance_transactions' AND column_name='notes') THEN
    ALTER TABLE finance_transactions ADD COLUMN notes text;
  END IF;
END $$;

ALTER TABLE finance_transactions ALTER COLUMN category SET DEFAULT 'General';

-- ── 2. Tighten UPDATE / DELETE to superadmin-only ────────────────────────────

DROP POLICY IF EXISTS "team_update_finance" ON finance_transactions;
CREATE POLICY "team_update_finance" ON finance_transactions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
        AND team_members.role = 'superadmin'
        AND team_members.status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
        AND team_members.role = 'superadmin'
        AND team_members.status = 'approved'
    )
  );

DROP POLICY IF EXISTS "team_delete_finance" ON finance_transactions;
CREATE POLICY "team_delete_finance" ON finance_transactions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
        AND team_members.role = 'superadmin'
        AND team_members.status = 'approved'
    )
  );

-- ── 3. Storage bucket ────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'finance-receipts',
  'finance-receipts',
  false,
  10485760,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/heic']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "auth_select_finance_receipts" ON storage.objects;
CREATE POLICY "auth_select_finance_receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'finance-receipts');

DROP POLICY IF EXISTS "auth_insert_finance_receipts" ON storage.objects;
CREATE POLICY "auth_insert_finance_receipts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'finance-receipts');

DROP POLICY IF EXISTS "superadmin_delete_finance_receipts" ON storage.objects;
CREATE POLICY "superadmin_delete_finance_receipts" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'finance-receipts'
    AND EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
        AND team_members.role = 'superadmin'
        AND team_members.status = 'approved'
    )
  );
