/*
# Client Management — Complete Client Profile Schema

## Purpose
Adds a one-to-one `client_profiles` table to store extended personal, emergency,
health, lifestyle, service, consent, and notes data for the client master record.
Also adds file upload support to the existing `documents` table and creates a
`client-documents` storage bucket for historical document uploads.

## 1. New Tables
- `client_profiles` (one-to-one with `clients`)
  - `id` uuid PK
  - `client_id` uuid UNIQUE NOT NULL, FK to clients ON DELETE CASCADE
  - Personal: `date_of_birth` date, `age` integer, `gender` text
  - Emergency: `emergency_contact_name` text, `emergency_contact_relationship` text, `emergency_contact_number` text
  - Health: `allergies` text, `current_medications` text, `pregnancy_breastfeeding` text, `pre_existing_conditions` text, `bleeding_disorders` text, `family_history` text[], `weight` text
  - Lifestyle: `smoking_vaping` text, `alcohol_consumption` text, `exercise_frequency` text, `water_intake` text
  - Services: `preferred_services` text[], `preferred_location` text, `preferred_branch_id` uuid FK to branches
  - Consent: `consent_given` boolean default false, `consent_date` timestamptz
  - Notes: `general_notes` text, `operational_notes` text
  - Audit: `created_at` timestamptz default now(), `updated_at` timestamptz default now()

## 2. Modified Tables
- `documents` — add `file_path` text (nullable) and `file_name` text (nullable)
  for storing uploaded file metadata. Existing text-only `content` field is preserved.

## 3. Storage
- Create `client-documents` bucket (private)
- Storage policies: authenticated users can INSERT/SELECT/DELETE files in this bucket

## 4. Security
- `client_profiles` RLS enabled
  - SELECT: open to all authenticated (same as clients)
  - INSERT: requires approved team member (same as clients INSERT)
  - UPDATE: requires approved team member (same as clients UPDATE)
  - DELETE: requires `clients.delete` permission (same as clients DELETE)
- Storage policies scoped to `client-documents` bucket for authenticated users

## 5. Important Notes
1. The `clients` table is NOT modified — all new fields go in `client_profiles`
2. No booking-specific transactional fields are copied
3. The existing `documents` table is reused — only `file_path` and `file_name` are added
4. No seed data is inserted
5. The migration is idempotent — safe to re-run
*/

-- ─── client_profiles table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date_of_birth date,
  age integer,
  gender text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_number text,
  allergies text,
  current_medications text,
  pregnancy_breastfeeding text,
  pre_existing_conditions text,
  bleeding_disorders text,
  family_history text[],
  weight text,
  smoking_vaping text,
  alcohol_consumption text,
  exercise_frequency text,
  water_intake text,
  preferred_services text[],
  preferred_location text,
  preferred_branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  consent_given boolean NOT NULL DEFAULT false,
  consent_date timestamptz,
  general_notes text,
  operational_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_select_client_profiles" ON client_profiles;
CREATE POLICY "team_select_client_profiles" ON client_profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "team_insert_client_profiles" ON client_profiles;
CREATE POLICY "team_insert_client_profiles" ON client_profiles FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
        AND team_members.status = 'approved'
    )
  );

DROP POLICY IF EXISTS "team_update_client_profiles" ON client_profiles;
CREATE POLICY "team_update_client_profiles" ON client_profiles FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
        AND team_members.status = 'approved'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
        AND team_members.status = 'approved'
    )
  );

DROP POLICY IF EXISTS "team_delete_client_profiles" ON client_profiles;
CREATE POLICY "team_delete_client_profiles" ON client_profiles FOR DELETE
  TO authenticated USING (has_permission('clients.delete'::text));

-- ─── documents: add file upload columns ───────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'file_path'
  ) THEN
    ALTER TABLE documents ADD COLUMN file_path text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'file_name'
  ) THEN
    ALTER TABLE documents ADD COLUMN file_name text;
  END IF;
END $$;

-- ─── client-documents storage bucket ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "auth_select_client_documents" ON storage.objects;
CREATE POLICY "auth_select_client_documents" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'client-documents');

DROP POLICY IF EXISTS "auth_insert_client_documents" ON storage.objects;
CREATE POLICY "auth_insert_client_documents" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'client-documents');

DROP POLICY IF EXISTS "auth_delete_client_documents" ON storage.objects;
CREATE POLICY "auth_delete_client_documents" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'client-documents');

-- ─── updated_at trigger for client_profiles ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_client_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_client_profiles_updated_at ON client_profiles;
CREATE TRIGGER trigger_client_profiles_updated_at
  BEFORE UPDATE ON client_profiles
  FOR EACH ROW EXECUTE FUNCTION update_client_profiles_updated_at();
