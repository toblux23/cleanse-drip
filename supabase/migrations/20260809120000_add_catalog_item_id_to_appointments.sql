/*
# Link appointments to the product catalog

## Purpose
`appointments.service` is free text. Inventory deduction currently resolves a
treatment recipe by matching that text against `treatment_recipes.treatment_name`
with ILIKE, which is fragile: the assistant flow writes multi-service strings
(`services_requested` joined with ', '), and those match no recipe at all, so
deduction silently skips.

`treatment_recipes` already has `catalog_item_id`. This adds the matching FK on
`appointments` so a recipe can be resolved by key instead of by name — the
foundation for editable services and for deducting inventory at treatment
selection rather than at completion.

## Changes
- Add column `catalog_item_id` (uuid, nullable) to `appointments`
- Add FK constraint referencing `catalog_items(id)` with ON DELETE SET NULL
- Add index on `appointments(catalog_item_id)` for recipe lookups
- Backfill existing rows where the service text matches exactly one catalog item

## Notes
- Nullable: existing appointments are unaffected and remain valid.
- `service` (text) is NOT dropped or altered. It stays as the display value and
  the fallback for rows that cannot be linked. The application keeps both in
  sync going forward; nothing downstream needs to change.
- The backfill is deliberately conservative. It only links a row when the
  normalised service text matches exactly ONE catalog item. Ambiguous names
  (duplicates) and multi-service strings are left null rather than guessed —
  a wrong link would deduct the wrong stock.
- Idempotent: safe to re-run. The backfill only touches rows still null.
*/

-- ─── Column + FK ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'catalog_item_id'
  ) THEN
    ALTER TABLE appointments ADD COLUMN catalog_item_id uuid;
    ALTER TABLE appointments ADD CONSTRAINT appointments_catalog_item_id_fkey
      FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS appointments_catalog_item_id_idx ON appointments(catalog_item_id);

-- ─── Conservative backfill ──────────────────────────────────────────────────
-- Links only where the trimmed, case-folded service text resolves to a single
-- catalog item. Inactive items are included: historical appointments may
-- reference a treatment that has since been retired, and that link is still
-- correct. A name shared by two items yields n > 1 and is skipped.
DO $$
DECLARE
  v_linked integer;
  v_remaining integer;
BEGIN
  WITH unique_names AS (
    SELECT
      lower(trim(name))   AS norm_name,
      (array_agg(id))[1]  AS catalog_id,
      count(*)            AS n
    FROM catalog_items
    WHERE name IS NOT NULL AND trim(name) <> ''
    GROUP BY lower(trim(name))
  )
  UPDATE appointments a
  SET catalog_item_id = u.catalog_id
  FROM unique_names u
  WHERE a.catalog_item_id IS NULL
    AND a.service IS NOT NULL
    AND u.n = 1
    AND lower(trim(a.service)) = u.norm_name;

  GET DIAGNOSTICS v_linked = ROW_COUNT;

  SELECT count(*) INTO v_remaining
  FROM appointments
  WHERE catalog_item_id IS NULL AND service IS NOT NULL AND trim(service) <> '';

  RAISE NOTICE 'catalog_item_id backfill: % appointment(s) linked, % still unlinked (ambiguous, multi-service, or no matching catalog item).', v_linked, v_remaining;
END $$;
