/*
# Security hardening — privilege escalation, PHI exposure, test accounts

Closes three issues found in the 2026-08-12 security review. Idempotent and
re-runnable; safe to apply as one transaction.

## 1. Privilege escalation via self-update on team_members  (CRITICAL)

`team_update_members` allowed `auth.uid() = user_id` for UPDATE with no column
restriction, so any authenticated user — including a brand-new `pending` signup,
since signup is open — could run:

    update team_members set role='superadmin', status='approved'
    where user_id = auth.uid()

and `has_permission()` would then return true for every permission, because it
reads `role`/`status` from the row the caller just rewrote. Anonymous signup to
full superadmin in two calls.

The self-update branch exists for legitimate self-service fields (the original
migration says "any future self-service fields"). That intent is preserved: the
policy still allows self-updates, but a trigger freezes `role` and `status` on
your own row unconditionally, and freezes `role`, `status`, `user_id` and
`branch_id` on anyone's row for callers without `team.manage` or `team.edit`.
A WITH CHECK clause cannot see OLD, which is why this is a trigger.

The existing admin RPCs (approve_member, reject_member, change_member_role,
update_member_profile) are unaffected — they already hold the right permission
and already refuse to act on the caller's own row. Service-role writes from
team-invite-member are exempted explicitly; see the trigger body.

## 2. Anonymous read access to patient medical records  (CRITICAL)

`clients`, `client_profiles` and `client_bookings` each granted
`SELECT ... TO anon USING (true)`. The anon key is public (it ships in the JS
bundle), so anyone could dump every intake record: DOB, address, phone,
medications, allergies, pregnancy status, pre-existing conditions, bleeding
disorders, family history, emergency contacts, and clinical notes.

Those policies existed only to support the public intake form:
  - `clients` SELECT  — duplicate lookup by email/phone before insert
  - `client_profiles` SELECT — PostgREST appends RETURNING to .upsert()
  - `client_bookings` SELECT — never needed; predates the medical columns and
    the "no data is sensitive at read level" note from 2026-07-06, which was
    written when this was a booking form rather than a clinic system.

All three are dropped. The intake form's needs move into
`intake_upsert_client_and_profile()`, a SECURITY DEFINER function that performs
the same duplicate-check order and the same writes but returns only a uuid, so
no table is readable by anon. The anon INSERT policies on `clients` and
`client_profiles` are dropped too — the function does those writes now, so anon
no longer needs direct write access to either table.

`client_bookings` anon INSERT is retained: the form still inserts the booking
directly and does not request RETURNING.

Authenticated team access is unchanged throughout.

## 3. Committed test accounts  (HIGH)

`20260720222529_..._create_test_nurse_staff_accounts.sql` created two approved
accounts whose passwords are in the repo in plaintext. Both are removed;
deleting from auth.users cascades to team_members.
*/

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. team_members — stop self-service updates from touching privileged columns
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "team_update_members" ON team_members;

DROP POLICY IF EXISTS "team_manage_update_members" ON team_members;
CREATE POLICY "team_manage_update_members" ON team_members FOR UPDATE
  TO authenticated
  USING (has_permission('team.manage'))
  WITH CHECK (has_permission('team.manage'));

DROP POLICY IF EXISTS "team_self_update_members" ON team_members;
CREATE POLICY "team_self_update_members" ON team_members FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION freeze_privileged_team_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Backend contexts have no auth.uid(): the service-role client in
  -- team-invite-member (which sets role and branch_id right after inviting),
  -- the SQL editor, and migrations. Triggers still fire for service_role even
  -- though RLS does not, so this exemption is required or invites break.
  -- A NULL uid is safe to trust here because every UPDATE policy on this table
  -- is TO authenticated, so anon can never reach this trigger.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Escalating yourself is never legitimate, at any permission level:
  -- change_member_role(), update_member_profile() and reject_member() all
  -- already refuse when member_user_id = auth.uid(). `role` and `status` are
  -- exactly the two columns has_permission() reads, so they are frozen on your
  -- own row no matter who you are. This is the hole that made anonymous signup
  -- a path to superadmin.
  IF NEW.user_id = v_uid OR OLD.user_id = v_uid THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Cannot change your own role' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Cannot change your own approval status' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Everything else privileged requires a team-management permission. team.edit
  -- is accepted alongside team.manage because update_member_profile() gates on
  -- team.edit and legitimately writes role and branch_id.
  IF NOT (has_permission('team.manage') OR has_permission('team.edit')) THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Cannot reassign user_id' USING ERRCODE = '42501';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Cannot change a role' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Cannot change an approval status' USING ERRCODE = '42501';
    END IF;
    IF NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
      RAISE EXCEPTION 'Cannot change a branch assignment' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_privileged_team_columns ON team_members;
CREATE TRIGGER trg_freeze_privileged_team_columns
  BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION freeze_privileged_team_columns();

-- Report the current superadmin roster so it can be eyeballed for accounts
-- that were escalated while the old policy was in place.
DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  RAISE NOTICE '── Superadmin audit (verify every row is expected) ──';
  FOR r IN
    SELECT email, status, created_at FROM team_members
    WHERE role = 'superadmin' ORDER BY created_at
  LOOP
    n := n + 1;
    RAISE NOTICE '  superadmin: % (status=%, created=%)', r.email, r.status, r.created_at;
  END LOOP;
  RAISE NOTICE '── % superadmin account(s) total ──', n;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Public intake — replace anon table access with a SECURITY DEFINER function
-- ═══════════════════════════════════════════════════════════════════════════

/*
Mirrors BookingForm.handleSubmit exactly:
  1. look up an existing client by email (case-insensitive), then by phone
  2. if found, return that id and leave the existing profile untouched
  3. if not found, insert the client, upsert the profile, return the new id

Returns only the client uuid — no patient data is readable through it.
*/
CREATE OR REPLACE FUNCTION intake_upsert_client_and_profile(
  p_client  jsonb,
  p_profile jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_full_name text := nullif(trim(p_client ->> 'full_name'), '');
  v_email     text := nullif(trim(p_client ->> 'email'), '');
  v_phone     text := nullif(trim(p_client ->> 'phone'), '');
  v_address   text := nullif(trim(p_client ->> 'address'), '');
BEGIN
  IF v_full_name IS NULL THEN
    RAISE EXCEPTION 'full_name is required' USING ERRCODE = '22023';
  END IF;

  -- Duplicate lookup: email first, then phone (same order as the manual flow).
  -- Uses lower() rather than the form's original ILIKE: ILIKE would treat a
  -- submitted '%' as a wildcard, letting a caller match an arbitrary existing
  -- client and attach their booking to it.
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_client_id FROM clients
    WHERE lower(email) = lower(v_email) LIMIT 1;
  END IF;

  IF v_client_id IS NULL AND v_phone IS NOT NULL THEN
    SELECT id INTO v_client_id FROM clients WHERE phone = v_phone LIMIT 1;
  END IF;

  IF v_client_id IS NOT NULL THEN
    RETURN v_client_id;
  END IF;

  INSERT INTO clients (full_name, email, phone, address, health_notes, status)
  VALUES (v_full_name, v_email, v_phone, v_address, NULL, 'active')
  RETURNING id INTO v_client_id;

  INSERT INTO client_profiles (
    client_id, date_of_birth, age, gender,
    emergency_contact_name, emergency_contact_number,
    allergies, current_medications, pregnancy_breastfeeding,
    pre_existing_conditions, bleeding_disorders, family_history, weight,
    smoking_vaping, alcohol_consumption, exercise_frequency, water_intake,
    consent_given, consent_date
  )
  VALUES (
    v_client_id,
    nullif(p_profile ->> 'date_of_birth', '')::date,
    nullif(p_profile ->> 'age', '')::integer,
    nullif(p_profile ->> 'gender', ''),
    nullif(p_profile ->> 'emergency_contact_name', ''),
    nullif(p_profile ->> 'emergency_contact_number', ''),
    nullif(p_profile ->> 'allergies', ''),
    nullif(p_profile ->> 'current_medications', ''),
    nullif(p_profile ->> 'pregnancy_breastfeeding', ''),
    nullif(p_profile ->> 'pre_existing_conditions', ''),
    nullif(p_profile ->> 'bleeding_disorders', ''),
    CASE
      WHEN jsonb_typeof(p_profile -> 'family_history') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_profile -> 'family_history'))
      ELSE NULL
    END,
    nullif(p_profile ->> 'weight', ''),
    nullif(p_profile ->> 'smoking_vaping', ''),
    nullif(p_profile ->> 'alcohol_consumption', ''),
    nullif(p_profile ->> 'exercise_frequency', ''),
    nullif(p_profile ->> 'water_intake', ''),
    coalesce((p_profile ->> 'consent_given')::boolean, true),
    coalesce(nullif(p_profile ->> 'consent_date', '')::timestamptz, now())
  )
  ON CONFLICT (client_id) DO NOTHING;

  RETURN v_client_id;
END;
$$;

REVOKE ALL ON FUNCTION intake_upsert_client_and_profile(jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION intake_upsert_client_and_profile(jsonb, jsonb) TO anon, authenticated;

-- ── Drop the anon table access the intake form no longer needs ───────────────

DROP POLICY IF EXISTS "anon_select_clients"         ON clients;
DROP POLICY IF EXISTS "anon_insert_clients"         ON clients;
DROP POLICY IF EXISTS "anon_select_client_profiles" ON client_profiles;
DROP POLICY IF EXISTS "anon_insert_client_profiles" ON client_profiles;
DROP POLICY IF EXISTS "anon_select_client_bookings" ON client_bookings;

-- ── Re-scope the public booking-form policies to anon INSERT only ────────────
-- anon_insert_client_bookings and anon_insert_client_feedback are intentionally
-- left in place: the public forms write these directly and request no RETURNING.

-- client_feedback SELECT was also open to anon and exposes free-text comments
-- tied to named clients. Nothing anonymous reads it; FeedbackForm only inserts.
DROP POLICY IF EXISTS "anon_select_client_feedback" ON client_feedback;

DROP POLICY IF EXISTS "team_select_client_feedback" ON client_feedback;
CREATE POLICY "team_select_client_feedback" ON client_feedback FOR SELECT
  TO authenticated USING (true);

-- client_bookings must stay readable by the team after the anon policy is gone.
DROP POLICY IF EXISTS "team_select_client_bookings" ON client_bookings;
CREATE POLICY "team_select_client_bookings" ON client_bookings FOR SELECT
  TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Remove the committed test accounts
-- ═══════════════════════════════════════════════════════════════════════════

DELETE FROM auth.users
WHERE email IN ('nurse.test@cleansedrip.ph', 'staff.test@cleansedrip.ph');

-- Belt and braces, in case the FK cascade is not in place on this database.
DELETE FROM team_members
WHERE email IN ('nurse.test@cleansedrip.ph', 'staff.test@cleansedrip.ph');

COMMIT;
