/*
# Make payment-receipts and attendance-photos private  (HIGH)

## ⚠ Apply this AFTER the frontend change is deployed, not before.

Public Supabase buckets serve object reads without consulting RLS, so every
payment receipt and staff attendance photo was readable by anyone holding the
URL — no login, no approval, no expiry. The URLs were not secret either: each
upload site called getPublicUrl() and wrote the result into a database column,
so any account that could read `appointments`, `nurse_collections` or
`time_logs` also collected a permanent public link to each file. Before
20260812120000, that included any pending signup.

The companion frontend change (src/lib/storageUrls.ts and its five call sites)
switches uploads to store the object PATH and mints a short-lived signed URL at
read time. Flipping the buckets private before that ships would break every
receipt thumbnail in Operations and every proof link in the remittance review,
because the stored public URLs stop resolving the moment `public` goes false.

Ordering therefore matters:
  1. deploy the frontend  (reads tolerate both shapes, writes produce paths)
  2. run this migration   (backfill legacy URLs, then flip the buckets)

Step 1 is safe on its own: resolveStorageUrl() recovers the path from a legacy
public URL, so signed reads work against a still-public bucket.

## Backfill

Existing rows hold full URLs. toObjectPath() in the frontend already tolerates
them, so this backfill is housekeeping rather than a correctness requirement —
but normalising now means the tolerance can eventually be deleted, and it keeps
the columns to one meaning apiece.

Filenames were sanitised at upload (`[^a-zA-Z0-9.]` -> `_`), so no
percent-decoding is needed here.

## Reversible

Rolling back means flipping `public` back to true. The backfilled columns then
hold paths rather than URLs, which the deployed frontend handles correctly
either way — so a rollback of this file alone does not require reverting the
frontend.
*/

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Normalise stored public URLs down to object paths
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  spec record;
  n integer;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('appointments',      'payment_receipt_url',   'payment-receipts'),
      ('nurse_collections', 'proof_url',             'payment-receipts'),
      ('nurse_collections', 'remittance_proof_url',  'payment-receipts'),
      ('time_logs',         'clock_in_photo_url',    'attendance-photos'),
      ('time_logs',         'clock_out_photo_url',   'attendance-photos')
    ) AS t(tbl, col, bucket)
  LOOP
    IF to_regclass('public.' || spec.tbl) IS NULL THEN
      RAISE NOTICE 'skip %.% (table not present)', spec.tbl, spec.col;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = spec.tbl
        AND column_name = spec.col
    ) THEN
      RAISE NOTICE 'skip %.% (column not present)', spec.tbl, spec.col;
      CONTINUE;
    END IF;

    EXECUTE format(
      'UPDATE public.%I
          SET %I = regexp_replace(%I,
                     ''^https?://[^/]+/storage/v1/object/public/%s/'', '''')
        WHERE %I LIKE ''http%%''',
      spec.tbl, spec.col, spec.col, spec.bucket, spec.col
    );
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'normalised % row(s) in %.%', n, spec.tbl, spec.col;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Flip the buckets private
-- ═══════════════════════════════════════════════════════════════════════════
-- From here reads require a signed URL. The RLS policies that gate who may
-- request one were already added by 20260812120000 (require_approved_
-- sensitive_buckets), which covers both of these buckets by name.

UPDATE storage.buckets
   SET public = false
 WHERE id IN ('payment-receipts', 'attendance-photos');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Report
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r record;
BEGIN
  RAISE NOTICE '── Bucket visibility ──';
  FOR r IN SELECT id, public FROM storage.buckets ORDER BY id LOOP
    RAISE NOTICE '  % — %', r.id, CASE WHEN r.public THEN 'PUBLIC' ELSE 'private' END;
  END LOOP;
  RAISE NOTICE 'Any row still PUBLIC holds files readable without authentication.';
END $$;

COMMIT;
