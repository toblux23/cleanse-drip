/*
# Link treatment recipes to their catalog items

## Why
Deduction resolves a recipe from `appointments.catalog_item_id` via
`treatment_recipes.catalog_item_id`. On the live database 21 of 24 active
recipes have that column null, so even a correctly-picked service resolves to
no recipe and nothing is deducted.

The recipe names already mirror the catalog almost exactly — "Steady Anchor
(Myers' Cocktail)", "Sea Cell (Focus & Clarity)", "Sculptra (Tirzepatide)" —
so they can be matched on name, once, here.

## Changes
- Sets `treatment_recipes.catalog_item_id` where the recipe name resolves to
  exactly one catalog item and nothing is already linked

## Safety rules
A recipe is linked ONLY when all of these hold:
  1. its `catalog_item_id` is currently null (never re-points an existing link)
  2. its normalised name matches exactly ONE catalog item
  3. its normalised name is unique among recipes (two recipes with the same
     name would otherwise both claim the same catalog item)
  4. that catalog item is not already claimed by another recipe

Anything failing a rule is left null and reported. A wrong link deducts the
wrong products from real stock, so silence is the correct failure mode —
`resolve_treatment_recipe` still falls back to name matching, and an unlinked
recipe simply behaves as it does today.

## Notes
- Idempotent: only touches rows still null, so re-running is a no-op.
- Purely additive. No recipe, component, or stock value is modified.
- Expect ~20 of 21 to link. "Test Recipe" has no catalog counterpart and will
  correctly remain unlinked.
*/

DO $$
DECLARE
  v_linked   integer;
  v_remaining integer;
  v_row      record;
BEGIN
  WITH unique_catalog AS (
    SELECT lower(btrim(name)) AS norm,
           (array_agg(id))[1] AS catalog_id,
           count(*)           AS n
    FROM catalog_items
    WHERE name IS NOT NULL AND btrim(name) <> ''
    GROUP BY lower(btrim(name))
  ),
  unique_recipe_names AS (
    SELECT lower(btrim(treatment_name)) AS norm, count(*) AS n
    FROM treatment_recipes
    WHERE catalog_item_id IS NULL
    GROUP BY lower(btrim(treatment_name))
  ),
  claimed AS (
    SELECT catalog_item_id FROM treatment_recipes WHERE catalog_item_id IS NOT NULL
  )
  UPDATE treatment_recipes r
  SET catalog_item_id = u.catalog_id
  FROM unique_catalog u, unique_recipe_names rn
  WHERE r.catalog_item_id IS NULL
    AND lower(btrim(r.treatment_name)) = u.norm
    AND lower(btrim(r.treatment_name)) = rn.norm
    AND u.n = 1
    AND rn.n = 1
    AND NOT EXISTS (SELECT 1 FROM claimed c WHERE c.catalog_item_id = u.catalog_id);

  GET DIAGNOSTICS v_linked = ROW_COUNT;

  SELECT count(*) INTO v_remaining
  FROM treatment_recipes
  WHERE catalog_item_id IS NULL;

  RAISE NOTICE 'Recipe linking: % recipe(s) linked to a catalog item, % still unlinked.', v_linked, v_remaining;

  FOR v_row IN
    SELECT treatment_name FROM treatment_recipes WHERE catalog_item_id IS NULL ORDER BY treatment_name
  LOOP
    RAISE NOTICE '  unlinked: %', v_row.treatment_name;
  END LOOP;
END $$;
