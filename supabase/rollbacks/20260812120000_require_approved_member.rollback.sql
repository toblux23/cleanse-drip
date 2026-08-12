/*
# Rollback for 20260812120000_require_approved_member.sql

Not a migration — do not let this run as part of `db push`. It lives here only
so the undo path sits next to the change it undoes. The leading ROLLBACK_ keeps
it out of the CLI's timestamp-ordered migration sequence.

Run this only if the restrictive policies lock out legitimate approved staff.
Doing so re-opens every hole described in the migration header, so treat it as
an emergency lever rather than a cleanup step, and re-apply a corrected version
promptly.

Because every policy the migration created is named `require_approved_*`, the
undo is a single sweep over pg_policies rather than a hand-maintained list —
it cannot drift out of sync with what was actually applied.
*/

BEGIN;

DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE policyname LIKE 'require_approved_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
    RAISE NOTICE 'dropped % on %.%', r.policyname, r.schemaname, r.tablename;
    n := n + 1;
  END LOOP;
  RAISE NOTICE '% restrictive policies removed', n;
END $$;

-- is_approved_member() is left in place deliberately: dropping it would break
-- anything written against it later, and an unused function is harmless.
-- To remove it as well:
--   DROP FUNCTION IF EXISTS public.is_approved_member();

COMMIT;
