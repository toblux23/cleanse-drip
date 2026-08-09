/*
# BugTrack module — bug reports and history

1. New Tables
- `bug_reports`: software bug reports submitted by authenticated team members.
  - id (uuid PK)
  - issue_title (text, not null)
  - affected_users (text)
  - observed_behavior (text, not null)
  - expected_behavior (text, not null)
  - error_message (text)
  - location (text, not null)
  - severity (text: critical|high|medium|low, default 'medium')
  - status (text: open|investigating|fix_in_progress|ready_for_testing|resolved|closed|reopened, default 'open')
  - reporter_user_id (uuid FK auth.users, default auth.uid())
  - assigned_user_id (uuid FK auth.users, nullable)
  - root_cause (text)
  - files_involved (text)
  - current_data_source (text)
  - minimum_fix (text)
  - validation_steps (text)
  - latest_generated_prompt (text)
  - attachment_url (text)
  - created_at, updated_at (timestamptz)
  - resolved_at, closed_at (timestamptz, nullable)
- `bug_history`: append-only audit timeline for each bug.
  - id (uuid PK)
  - bug_id (uuid FK bug_reports, cascade delete)
  - action_type (text, not null)
  - note (text)
  - performed_by (uuid FK auth.users, default auth.uid())
  - created_at (timestamptz)

2. Indexes
- bug_reports(reporter_user_id), bug_reports(assigned_user_id), bug_reports(status), bug_reports(severity), bug_reports(created_at)
- bug_history(bug_id), bug_history(created_at)

3. updated_at trigger
- A trigger keeps bug_reports.updated_at in sync after each update.

4. Security (RLS)
- bug_reports SELECT: authenticated users can see bugs they reported, bugs assigned to them, or all bugs if they hold a management role (superadmin / head_clinical_ops).
- bug_reports INSERT: any authenticated user may submit a bug. reporter_user_id defaults to auth.uid() so the WITH CHECK passes.
- bug_reports UPDATE: only management roles (superadmin / head_clinical_ops) may update bug fields (assign, severity, status, resolve, close, reopen, etc.).
- bug_reports DELETE: only management roles may delete.
- bug_history SELECT: same visibility as the parent bug (reporter, assignee, or management role).
- bug_history INSERT: any authenticated user who can see the parent bug may add a history note. No UPDATE or DELETE policies — history is append-only.
- No anonymous access — all policies are TO authenticated only.
*/

-- ─── bug_reports ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_title text NOT NULL,
  affected_users text,
  observed_behavior text NOT NULL,
  expected_behavior text NOT NULL,
  error_message text,
  location text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','low')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','fix_in_progress','ready_for_testing','resolved','closed','reopened')),
  reporter_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  root_cause text,
  files_involved text,
  current_data_source text,
  minimum_fix text,
  validation_steps text,
  latest_generated_prompt text,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_reporter ON bug_reports(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_assigned ON bug_reports(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_severity ON bug_reports(severity);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON bug_reports(created_at DESC);

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Helper: management role check (superadmin or head_clinical_ops)
-- We resolve the caller's team_members.role and check against the two management roles.
CREATE OR REPLACE FUNCTION is_bugtrack_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.status = 'approved'
      AND tm.role IN ('superadmin','head_clinical_ops')
  );
$$;

-- SELECT: reporter, assignee, or management role
DROP POLICY IF EXISTS "bug_reports_select_own_or_manager" ON bug_reports;
CREATE POLICY "bug_reports_select_own_or_manager"
ON bug_reports FOR SELECT
TO authenticated
USING (
  reporter_user_id = auth.uid()
  OR assigned_user_id = auth.uid()
  OR is_bugtrack_manager()
);

-- INSERT: any authenticated user (reporter_user_id defaults to auth.uid())
DROP POLICY IF EXISTS "bug_reports_insert_authenticated" ON bug_reports;
CREATE POLICY "bug_reports_insert_authenticated"
ON bug_reports FOR INSERT
TO authenticated
WITH CHECK (reporter_user_id = auth.uid());

-- UPDATE: management roles only
DROP POLICY IF EXISTS "bug_reports_update_manager_only" ON bug_reports;
CREATE POLICY "bug_reports_update_manager_only"
ON bug_reports FOR UPDATE
TO authenticated
USING (is_bugtrack_manager())
WITH CHECK (is_bugtrack_manager());

-- DELETE: management roles only
DROP POLICY IF EXISTS "bug_reports_delete_manager_only" ON bug_reports;
CREATE POLICY "bug_reports_delete_manager_only"
ON bug_reports FOR DELETE
TO authenticated
USING (is_bugtrack_manager());

-- ─── bug_history ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bug_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_id uuid NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  note text,
  performed_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bug_history_bug ON bug_history(bug_id);
CREATE INDEX IF NOT EXISTS idx_bug_history_created ON bug_history(created_at DESC);

ALTER TABLE bug_history ENABLE ROW LEVEL SECURITY;

-- SELECT: same visibility as parent bug
DROP POLICY IF EXISTS "bug_history_select_with_bug" ON bug_history;
CREATE POLICY "bug_history_select_with_bug"
ON bug_history FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM bug_reports br
    WHERE br.id = bug_history.bug_id
      AND (
        br.reporter_user_id = auth.uid()
        OR br.assigned_user_id = auth.uid()
        OR is_bugtrack_manager()
      )
  )
);

-- INSERT: any authenticated user who can see the parent bug
DROP POLICY IF EXISTS "bug_history_insert_with_bug" ON bug_history;
CREATE POLICY "bug_history_insert_with_bug"
ON bug_history FOR INSERT
TO authenticated
WITH CHECK (
  performed_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM bug_reports br
    WHERE br.id = bug_history.bug_id
      AND (
        br.reporter_user_id = auth.uid()
        OR br.assigned_user_id = auth.uid()
        OR is_bugtrack_manager()
      )
  )
);

-- No UPDATE or DELETE policies: history is append-only.

-- ─── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_bug_reports_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bug_reports_updated_at ON bug_reports;
CREATE TRIGGER trg_bug_reports_updated_at
BEFORE UPDATE ON bug_reports
FOR EACH ROW
EXECUTE FUNCTION set_bug_reports_updated_at();
