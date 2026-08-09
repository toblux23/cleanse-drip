/*
# Wishlist module — feature requests, improvements, and ideas

1. New Tables
- `wishlist_requests`: feature/improvement requests submitted by authenticated team members.
  - id (uuid PK)
  - title (text, not null)
  - description (text, not null)
  - problem_or_opportunity (text, not null)
  - expected_benefit (text, not null)
  - location (text, not null)
  - beneficiaries (text)
  - suggested_solution (text)
  - category (text, not null, default 'Other') — see CHECK
  - urgency (text, not null, default 'Medium') — see CHECK
  - business_impact (text, not null, default 'To Be Assessed') — see CHECK
  - status (text, not null, default 'Submitted') — see CHECK
  - submitted_by (uuid FK auth.users, default auth.uid())
  - assigned_owner (uuid FK auth.users, nullable)
  - management_assessment (text)
  - strategic_alignment (text)
  - technical_feasibility (text)
  - estimated_effort (text, default 'To Be Assessed') — see CHECK
  - dependencies (text)
  - risks (text)
  - decision_reason (text)
  - implementation_notes (text)
  - related_module (text)
  - target_date (date, nullable)
  - latest_generated_prompt (text)
  - attachment_url (text)
  - created_at, updated_at (timestamptz)
  - completed_at, archived_at (timestamptz, nullable)
- `wishlist_votes`: one vote per user per request.
  - id (uuid PK)
  - wishlist_id (uuid FK wishlist_requests, cascade delete)
  - user_id (uuid FK auth.users, cascade delete)
  - created_at (timestamptz)
  - UNIQUE (wishlist_id, user_id)
- `wishlist_history`: append-only audit timeline for each request.
  - id (uuid PK)
  - wishlist_id (uuid FK wishlist_requests, cascade delete)
  - action_type (text, not null)
  - note (text)
  - performed_by (uuid FK auth.users, default auth.uid())
  - created_at (timestamptz)

2. Indexes
- wishlist_requests(submitted_by), wishlist_requests(assigned_owner), wishlist_requests(status),
  wishlist_requests(category), wishlist_requests(urgency), wishlist_requests(business_impact), wishlist_requests(created_at)
- wishlist_votes(wishlist_id), wishlist_votes(user_id), UNIQUE(wishlist_id, user_id)
- wishlist_history(wishlist_id), wishlist_history(created_at)

3. updated_at trigger on wishlist_requests.

4. Security (RLS)
- wishlist_requests SELECT: authenticated users see requests they submitted, are assigned to, or all if management role.
- wishlist_requests INSERT: authenticated, submitted_by = auth.uid().
- wishlist_requests UPDATE: management roles only.
- wishlist_requests DELETE: management roles only.
- wishlist_votes SELECT: authenticated (to compute counts).
- wishlist_votes INSERT: authenticated, user_id = auth.uid().
- wishlist_votes DELETE: user_id = auth.uid() only (remove own vote).
- wishlist_history SELECT: same visibility as parent request.
- wishlist_history INSERT: authenticated users who can see the parent request. Append-only (no UPDATE/DELETE).
- No anonymous access.
*/

-- ─── wishlist_requests ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlist_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  problem_or_opportunity text NOT NULL,
  expected_benefit text NOT NULL,
  location text NOT NULL,
  beneficiaries text,
  suggested_solution text,
  category text NOT NULL DEFAULT 'Other' CHECK (category IN ('New Feature','Improvement','Automation','UI/UX','Reporting','Integration','Workflow','Client Experience','Employee Experience','Operations','Financial','Security','Other')),
  urgency text NOT NULL DEFAULT 'Medium' CHECK (urgency IN ('Critical','High','Medium','Low','Future Idea')),
  business_impact text NOT NULL DEFAULT 'To Be Assessed' CHECK (business_impact IN ('Transformational','High','Moderate','Low','To Be Assessed')),
  status text NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted','Under Review','Needs Clarification','Approved','Planned','In Development','Ready for Testing','Completed','Deferred','Rejected','Archived')),
  submitted_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_owner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  management_assessment text,
  strategic_alignment text,
  technical_feasibility text,
  estimated_effort text DEFAULT 'To Be Assessed' CHECK (estimated_effort IN ('Quick Win','Small','Medium','Large','Major Initiative','To Be Assessed')),
  dependencies text,
  risks text,
  decision_reason text,
  implementation_notes text,
  related_module text,
  target_date date,
  latest_generated_prompt text,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_wishlist_requests_submitted_by ON wishlist_requests(submitted_by);
CREATE INDEX IF NOT EXISTS idx_wishlist_requests_assigned_owner ON wishlist_requests(assigned_owner);
CREATE INDEX IF NOT EXISTS idx_wishlist_requests_status ON wishlist_requests(status);
CREATE INDEX IF NOT EXISTS idx_wishlist_requests_category ON wishlist_requests(category);
CREATE INDEX IF NOT EXISTS idx_wishlist_requests_urgency ON wishlist_requests(urgency);
CREATE INDEX IF NOT EXISTS idx_wishlist_requests_business_impact ON wishlist_requests(business_impact);
CREATE INDEX IF NOT EXISTS idx_wishlist_requests_created ON wishlist_requests(created_at DESC);

ALTER TABLE wishlist_requests ENABLE ROW LEVEL SECURITY;

-- Helper: management role check (superadmin or head_clinical_ops)
CREATE OR REPLACE FUNCTION is_wishlist_manager()
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

-- SELECT: submitter, assigned owner, or management role
DROP POLICY IF EXISTS "wishlist_requests_select_own_or_manager" ON wishlist_requests;
CREATE POLICY "wishlist_requests_select_own_or_manager"
ON wishlist_requests FOR SELECT
TO authenticated
USING (
  submitted_by = auth.uid()
  OR assigned_owner = auth.uid()
  OR is_wishlist_manager()
);

-- INSERT: any authenticated user (submitted_by defaults to auth.uid())
DROP POLICY IF EXISTS "wishlist_requests_insert_authenticated" ON wishlist_requests;
CREATE POLICY "wishlist_requests_insert_authenticated"
ON wishlist_requests FOR INSERT
TO authenticated
WITH CHECK (submitted_by = auth.uid());

-- UPDATE: management roles only
DROP POLICY IF EXISTS "wishlist_requests_update_manager_only" ON wishlist_requests;
CREATE POLICY "wishlist_requests_update_manager_only"
ON wishlist_requests FOR UPDATE
TO authenticated
USING (is_wishlist_manager())
WITH CHECK (is_wishlist_manager());

-- DELETE: management roles only
DROP POLICY IF EXISTS "wishlist_requests_delete_manager_only" ON wishlist_requests;
CREATE POLICY "wishlist_requests_delete_manager_only"
ON wishlist_requests FOR DELETE
TO authenticated
USING (is_wishlist_manager());

-- ─── wishlist_votes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlist_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wishlist_id uuid NOT NULL REFERENCES wishlist_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wishlist_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_votes_wishlist ON wishlist_votes(wishlist_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_votes_user ON wishlist_votes(user_id);

ALTER TABLE wishlist_votes ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated (needed to compute vote counts and show voted state)
DROP POLICY IF EXISTS "wishlist_votes_select_authenticated" ON wishlist_votes;
CREATE POLICY "wishlist_votes_select_authenticated"
ON wishlist_votes FOR SELECT
TO authenticated
USING (true);

-- INSERT: authenticated, user_id = auth.uid()
DROP POLICY IF EXISTS "wishlist_votes_insert_own" ON wishlist_votes;
CREATE POLICY "wishlist_votes_insert_own"
ON wishlist_votes FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- DELETE: only own vote
DROP POLICY IF EXISTS "wishlist_votes_delete_own" ON wishlist_votes;
CREATE POLICY "wishlist_votes_delete_own"
ON wishlist_votes FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ─── wishlist_history ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlist_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wishlist_id uuid NOT NULL REFERENCES wishlist_requests(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  note text,
  performed_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wishlist_history_wishlist ON wishlist_history(wishlist_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_history_created ON wishlist_history(created_at DESC);

ALTER TABLE wishlist_history ENABLE ROW LEVEL SECURITY;

-- SELECT: same visibility as parent request
DROP POLICY IF EXISTS "wishlist_history_select_with_request" ON wishlist_history;
CREATE POLICY "wishlist_history_select_with_request"
ON wishlist_history FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM wishlist_requests wr
    WHERE wr.id = wishlist_history.wishlist_id
      AND (
        wr.submitted_by = auth.uid()
        OR wr.assigned_owner = auth.uid()
        OR is_wishlist_manager()
      )
  )
);

-- INSERT: any authenticated user who can see the parent request
DROP POLICY IF EXISTS "wishlist_history_insert_with_request" ON wishlist_history;
CREATE POLICY "wishlist_history_insert_with_request"
ON wishlist_history FOR INSERT
TO authenticated
WITH CHECK (
  performed_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM wishlist_requests wr
    WHERE wr.id = wishlist_history.wishlist_id
      AND (
        wr.submitted_by = auth.uid()
        OR wr.assigned_owner = auth.uid()
        OR is_wishlist_manager()
      )
  )
);

-- No UPDATE or DELETE policies: history is append-only.

-- ─── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_wishlist_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wishlist_requests_updated_at ON wishlist_requests;
CREATE TRIGGER trg_wishlist_requests_updated_at
BEFORE UPDATE ON wishlist_requests
FOR EACH ROW
EXECUTE FUNCTION set_wishlist_requests_updated_at();
