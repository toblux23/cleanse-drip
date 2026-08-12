/*
# Require approved membership, not merely authentication  (CRITICAL)

## The bug class

Signup is open to the world (Login.tsx calls `supabase.auth.signUp` with no
domain allowlist and no invite code). A brand-new signup lands in team_members
with `status='pending'`, and App.tsx renders <PendingApproval> for them — but
that is a React branch, not a security boundary. The account still holds a
valid `authenticated` JWT, and the anon key ships in the JS bundle. An attacker
who never loads the app's JS simply calls PostgREST directly.

Roughly 90 policies across the schema are written `TO authenticated USING (true)`
or `WITH CHECK (true)`. Every one of them is satisfied by that pending token:

    POST /auth/v1/signup                  -> access_token
    GET  /rest/v1/team_members?select=*   -> full staff roster + who is superadmin
    GET  /rest/v1/client_profiles         -> DOB, meds, allergies, conditions
    DELETE /rest/v1/client_bookings?id=neq.0  -> every booking, gone

The 2026-08-12 hardening migration closed the `anon` half of this (and the
team_members UPDATE escalation) but re-created two policies as
`TO authenticated USING (true)`, on the reasonable-looking assumption that
"authenticated" meant "approved staff". It does not. This migration fixes the
assumption itself rather than the individual policies.

## Approach: restrictive policies

Permissive policies OR together, so patching them one by one means finding and
rewriting all ~90 without missing any — and any new `USING (true)` policy added
later silently re-opens the hole. Restrictive policies AND with everything else,
so a single one per table closes every command at once and cannot widen access.
The existing permissive policies are left exactly as they are; they now have to
pass an approval check as well.

Scoped `TO authenticated` throughout, so the anon policies the public forms
depend on are untouched.

## Deliberately NOT gated

- `client_bookings` / `client_feedback` INSERT — BookingForm.tsx:533 and
  FeedbackForm.tsx:173 are public forms reachable from the nav while a user
  happens to be signed in, so those inserts can arrive as `authenticated`.
  SELECT/UPDATE/DELETE on both tables are gated.
- `catalog_items`, `client_consent_records`, `booking_time_slots` — public
  booking/consent surfaces, anon by design.
- `team_members` self-read — App.tsx:44 reads the caller's own row to decide
  whether to show <PendingApproval>. Gating that would lock everyone out of
  the approval screen, so the policy carries an explicit self-row exception.

## Not fixed here — needs a frontend change first

`payment-receipts` and `attendance-photos` are `public: true` buckets, and
NursePaymentModals.tsx / NurseDashboardTab.tsx read them via `getPublicUrl()`
and persist that URL in the database. Public buckets serve reads without
consulting RLS, so those files are world-readable to anyone with the URL and
this migration cannot change that without breaking every stored link. Fixing it
means switching those call sites to `createSignedUrl()` (as ClientManagementTab
and PrescriptionUploads already do for client-documents), storing the path
instead of the URL, then flipping the buckets private. Tracked separately.
*/

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The approval predicate
-- ═══════════════════════════════════════════════════════════════════════════

-- SECURITY DEFINER for the same reason has_permission() is: a policy on
-- team_members that reads team_members would recurse infinitely otherwise.
-- STABLE so the planner caches it per statement instead of per row.
CREATE OR REPLACE FUNCTION public.is_approved_member()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid()
      AND status  = 'approved'
  );
$$;

REVOKE ALL ON FUNCTION public.is_approved_member() FROM public;
GRANT EXECUTE ON FUNCTION public.is_approved_member() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. team_members — own row always readable, everything else needs approval
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "require_approved_team_members" ON team_members;
CREATE POLICY "require_approved_team_members" ON team_members
  AS RESTRICTIVE FOR ALL TO authenticated
  USING      (auth.uid() = user_id OR is_approved_member())
  WITH CHECK (auth.uid() = user_id OR is_approved_member());

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Every table whose access should mean "approved staff"
-- ═══════════════════════════════════════════════════════════════════════════

-- to_regclass guard: skips tables this database does not have, so the
-- migration stays re-runnable across environments that are partially migrated.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- clinical + client records
    'clients', 'client_profiles', 'appointments', 'client_treatment_notes',
    -- operations
    'branches', 'operational_tasks', 'qr_sources', 'feature_settings',
    'consultation_requests', 'consultation_recommendations',
    'booking_buffer_settings', 'booking_buffer_audit',
    -- money
    'packages', 'orders', 'payments', 'finance_transactions',
    'nurse_collections', 'nurse_collection_audit',
    -- RBAC catalog (leaks the permission model and role names)
    'roles', 'permissions', 'role_permissions',
    -- inventory
    'inventory_products', 'inventory_batches', 'inventory_transactions',
    'inventory_suppliers', 'inventory_purchase_orders',
    'inventory_purchase_order_items', 'inventory_transfers',
    'inventory_imports', 'inventory_requests', 'inventory_request_items',
    'inventory_reservations', 'inventory_cost_history', 'inventory_audits',
    'inventory_audit_items', 'inventory_attachments', 'inventory_kits',
    'inventory_kit_items', 'inventory_categories', 'inventory_subcategories',
    'inventory_types', 'treatment_recipes', 'treatment_recipe_items',
    -- internal tools and staff notifications
    'bug_reports', 'bug_history', 'wishlist_requests', 'wishlist_votes',
    'wishlist_history', 'notification_settings', 'notification_deliveries',
    'nurse_notifications', 'nurse_notification_preferences'
  ];
  -- Intentionally absent: catalog_items, catalog_categories, booking_time_slots
  -- (anon-readable by design for the public booking form), and the three
  -- public-form tables handled per-command in section 4.
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skip % (not present)', t;
      CONTINUE;
    END IF;

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'require_approved_' || t, t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I
         AS RESTRICTIVE FOR ALL TO authenticated
         USING (is_approved_member()) WITH CHECK (is_approved_member())',
      'require_approved_' || t, t
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. client_bookings / client_feedback — read and mutate, but not insert
-- ═══════════════════════════════════════════════════════════════════════════
-- FOR ALL would block the public forms when the visitor is signed in, so the
-- INSERT path is left to the existing anon_insert_* policies.

DROP POLICY IF EXISTS "require_approved_select_client_bookings" ON client_bookings;
CREATE POLICY "require_approved_select_client_bookings" ON client_bookings
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_approved_member());

DROP POLICY IF EXISTS "require_approved_update_client_bookings" ON client_bookings;
CREATE POLICY "require_approved_update_client_bookings" ON client_bookings
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (is_approved_member()) WITH CHECK (is_approved_member());

DROP POLICY IF EXISTS "require_approved_delete_client_bookings" ON client_bookings;
CREATE POLICY "require_approved_delete_client_bookings" ON client_bookings
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_approved_member());

DROP POLICY IF EXISTS "require_approved_select_client_feedback" ON client_feedback;
CREATE POLICY "require_approved_select_client_feedback" ON client_feedback
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_approved_member());

DROP POLICY IF EXISTS "require_approved_update_client_feedback" ON client_feedback;
CREATE POLICY "require_approved_update_client_feedback" ON client_feedback
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (is_approved_member()) WITH CHECK (is_approved_member());

DROP POLICY IF EXISTS "require_approved_delete_client_feedback" ON client_feedback;
CREATE POLICY "require_approved_delete_client_feedback" ON client_feedback
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_approved_member());

-- client_consent_records has the same shape: anon_insert_consent_records is
-- TO anon, authenticated because the QR consent link may be opened by someone
-- who happens to be signed in. Its own SELECT/UPDATE/DELETE policies are
-- already has_permission-gated; these restrictives are defence in depth.

DROP POLICY IF EXISTS "require_approved_select_consent_records" ON client_consent_records;
CREATE POLICY "require_approved_select_consent_records" ON client_consent_records
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_approved_member());

DROP POLICY IF EXISTS "require_approved_update_consent_records" ON client_consent_records;
CREATE POLICY "require_approved_update_consent_records" ON client_consent_records
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (is_approved_member()) WITH CHECK (is_approved_member());

DROP POLICY IF EXISTS "require_approved_delete_consent_records" ON client_consent_records;
CREATE POLICY "require_approved_delete_consent_records" ON client_consent_records
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_approved_member());

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Storage — private buckets holding PHI and financial documents
-- ═══════════════════════════════════════════════════════════════════════════
-- Narrowed to the sensitive buckets by name so unrelated buckets keep working.
-- payment-receipts and attendance-photos are listed too: it does not stop the
-- public-bucket reads (see header), but it does stop a pending account from
-- uploading into them or enumerating them through the authenticated API.

DROP POLICY IF EXISTS "require_approved_sensitive_buckets" ON storage.objects;
CREATE POLICY "require_approved_sensitive_buckets" ON storage.objects
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    bucket_id NOT IN ('client-documents', 'finance-receipts',
                      'payment-receipts', 'attendance-photos')
    OR is_approved_member()
  )
  WITH CHECK (
    bucket_id NOT IN ('client-documents', 'finance-receipts',
                      'payment-receipts', 'attendance-photos')
    OR is_approved_member()
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Audit: report anything still reachable by an unapproved account
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  RAISE NOTICE '── Permissive authenticated policies with no approval gate ──';
  FOR r IN
    SELECT p.schemaname, p.tablename, p.policyname, p.cmd
    FROM pg_policies p
    WHERE p.permissive = 'PERMISSIVE'
      AND 'authenticated' = ANY (p.roles)
      AND coalesce(p.qual, 'true') NOT ILIKE '%is_approved_member%'
      AND coalesce(p.qual, 'true') NOT ILIKE '%has_permission%'
      AND coalesce(p.qual, 'true') NOT ILIKE '%status%'
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies rp
        WHERE rp.schemaname = p.schemaname
          AND rp.tablename  = p.tablename
          AND rp.permissive = 'RESTRICTIVE'
          AND rp.qual ILIKE '%is_approved_member%'
      )
    ORDER BY p.tablename, p.policyname
  LOOP
    RAISE NOTICE '  %.% — % (%)', r.schemaname, r.tablename, r.policyname, r.cmd;
    n := n + 1;
  END LOOP;

  IF n = 0 THEN
    RAISE NOTICE '  none — every authenticated policy is behind an approval or permission check';
  ELSE
    RAISE NOTICE '  % remaining; each is intentional (public forms) or needs review', n;
  END IF;
END $$;

COMMIT;
