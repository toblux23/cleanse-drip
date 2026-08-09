/*
# Team Members — approval-gated access control

## Summary
Adds a team membership table that gates access to the Team Dashboard behind superadmin approval.
When a new user registers, a trigger automatically creates their team_members record.
richard@startuplab.ph is auto-approved as superadmin; all others start as 'pending'.
Three SECURITY DEFINER RPC functions let the superadmin approve, reject, or revoke members
without exposing direct table UPDATE/DELETE to clients.

## New Table: team_members
- `id` — UUID primary key
- `user_id` — FK to auth.users, unique (one record per auth user)
- `email` — team member email, unique
- `role` — 'superadmin' | 'member'
- `status` — 'pending' | 'approved' | 'rejected'
- `approved_by` — nullable FK to auth.users (who approved them)
- `approved_at` — nullable timestamp of approval
- `created_at` — registration timestamp

## Trigger: on_auth_user_created
- Fires AFTER INSERT on auth.users
- Creates a team_members row automatically for every new auth user
- richard@startuplab.ph → role='superadmin', status='approved'
- All other emails → role='member', status='pending'
- ON CONFLICT DO NOTHING so it is safe to re-run/backfill

## RPC Functions (SECURITY DEFINER — bypass RLS, verify caller is superadmin internally)
1. approve_member(member_user_id uuid) — sets status='approved', records approved_by + approved_at
2. reject_member(member_user_id uuid)  — sets status='rejected'
3. revoke_member(member_user_id uuid)  — sets status='rejected' (revokes access for an approved member)

## Security
- RLS enabled; SELECT open to all authenticated users (needed to check own status + superadmin sees all)
- No direct client UPDATE or DELETE — all mutations go through SECURITY DEFINER RPCs
- RPCs verify the caller is an approved superadmin before executing

## Important Notes
1. Backfill at the end inserts records for any existing auth users, safe to re-run (ON CONFLICT DO NOTHING).
2. The trigger and RPCs use SET search_path = public to prevent search_path injection attacks.
*/

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('superadmin', 'member')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read all records (needed to check own status; superadmin sees all pending)
DROP POLICY IF EXISTS "auth_select_team_members" ON public.team_members;
CREATE POLICY "auth_select_team_members" ON public.team_members FOR SELECT
  TO authenticated USING (true);

-- INSERT only via trigger (SECURITY DEFINER bypasses RLS); fallback policy for direct insert
DROP POLICY IF EXISTS "auth_insert_own_team_member" ON public.team_members;
CREATE POLICY "auth_insert_own_team_member" ON public.team_members FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- ── Trigger: auto-create team_members row on new auth user ───────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.team_members (user_id, email, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    CASE WHEN NEW.email = 'richard@startuplab.ph' THEN 'superadmin' ELSE 'member' END,
    CASE WHEN NEW.email = 'richard@startuplab.ph' THEN 'approved' ELSE 'pending' END
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── RPC: approve_member ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_member(member_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text; v_status text;
BEGIN
  SELECT role, status INTO v_role, v_status
  FROM public.team_members WHERE user_id = auth.uid();
  IF v_role <> 'superadmin' OR v_status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved superadmins can approve members';
  END IF;
  UPDATE public.team_members
  SET status = 'approved', approved_by = auth.uid(), approved_at = now()
  WHERE user_id = member_user_id;
END;
$$;

-- ── RPC: reject_member ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_member(member_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text; v_status text;
BEGIN
  SELECT role, status INTO v_role, v_status
  FROM public.team_members WHERE user_id = auth.uid();
  IF v_role <> 'superadmin' OR v_status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved superadmins can reject members';
  END IF;
  UPDATE public.team_members
  SET status = 'rejected', approved_by = null, approved_at = null
  WHERE user_id = member_user_id;
END;
$$;

-- ── RPC: revoke_member ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_member(member_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text; v_status text;
BEGIN
  SELECT role, status INTO v_role, v_status
  FROM public.team_members WHERE user_id = auth.uid();
  IF v_role <> 'superadmin' OR v_status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved superadmins can revoke members';
  END IF;
  -- Prevent superadmin from revoking themselves
  IF member_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Superadmin cannot revoke their own access';
  END IF;
  UPDATE public.team_members
  SET status = 'rejected', approved_by = null, approved_at = null
  WHERE user_id = member_user_id;
END;
$$;

-- ── Backfill existing auth users ──────────────────────────────────────────────

INSERT INTO public.team_members (user_id, email, role, status)
SELECT
  id,
  email,
  CASE WHEN email = 'richard@startuplab.ph' THEN 'superadmin' ELSE 'member' END,
  CASE WHEN email = 'richard@startuplab.ph' THEN 'approved' ELSE 'pending' END
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
