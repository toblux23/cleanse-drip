/*
# Feature toggle for automatic inventory deduction

## Purpose
Automatic deduction changes real stock the moment a treatment starts. It needs
an operational switch so it can be turned off without reverting a migration,
and so the deduction machinery can be installed before anyone is ready to rely
on it.

Shipped DISABLED. Applying 20260809140000 alongside this migration installs the
trigger and functions but moves no stock until the toggle is turned on in
Settings.

## Changes
- Seed `feature_settings` with `inventory.auto_deduct`, enabled = false
- Add `is_feature_enabled(key)` helper, defaulting to false for unknown keys
- Re-create `apply_treatment_deduction` with the toggle checked first

## Notes
- The check lives in the database, not the UI. Deduction fires from
  trg_treatment_inventory server-side, so a React-only switch would not gate it.
- `reverse_treatment_deduction` is deliberately NOT gated. If deduction is
  turned off after stock has already moved, a later service change must still
  return that stock. Undoing a real movement is not a toggleable behaviour.
- Turning the toggle off does not un-deduct anything already deducted; it only
  stops future deductions.
- While disabled, nothing deducts automatically at all — 20260809140000 retires
  the old completion-time trigger. Stock must be adjusted manually until the
  toggle is enabled.
*/

-- ─── Feature flag row ───────────────────────────────────────────────────────
INSERT INTO feature_settings (key, enabled)
SELECT 'inventory.auto_deduct', false
WHERE NOT EXISTS (SELECT 1 FROM feature_settings WHERE key = 'inventory.auto_deduct');

-- ─── Helper ─────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the trigger can read the flag regardless of the caller's
-- RLS visibility. Unknown keys are treated as disabled: a missing flag must
-- never mean "on" for something that moves stock.
CREATE OR REPLACE FUNCTION public.is_feature_enabled(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT enabled FROM feature_settings WHERE key = p_key LIMIT 1), false);
$function$;

-- ─── Gate deduction on the flag ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_treatment_deduction(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_appt record;
  v_recipe_id uuid;
  v_recipe_name text;
  v_item record;
  v_user_email text;
  v_issues text[] := ARRAY[]::text[];
  v_product_name text;
  v_deducted_any boolean := false;
BEGIN
  -- Feature toggle. Checked here rather than in the UI because deduction runs
  -- in a database trigger: a client-side switch would be decorative.
  IF NOT is_feature_enabled('inventory.auto_deduct') THEN
    RETURN;
  END IF;

  SELECT id, branch_id, service, catalog_item_id, inventory_deducted_at
    INTO v_appt
  FROM appointments WHERE id = p_appointment_id;

  IF NOT FOUND OR v_appt.inventory_deducted_at IS NOT NULL THEN
    RETURN;
  END IF;

  v_recipe_id := resolve_treatment_recipe(v_appt.catalog_item_id, v_appt.service);

  -- No recipe is not an error in itself (a consultation has nothing to deduct),
  -- but it must be visible: the alternative is a treatment that silently
  -- consumes no stock.
  IF v_recipe_id IS NULL THEN
    UPDATE appointments
    SET inventory_deduction_issues = ARRAY[
      'No inventory recipe is linked to "' || coalesce(v_appt.service, 'this service') ||
      '", so nothing was deducted. Re-select the service from the catalog, or add a recipe to it under Products & Packages.'
    ]
    WHERE id = p_appointment_id;
    RETURN;
  END IF;

  SELECT treatment_name INTO v_recipe_name FROM treatment_recipes WHERE id = v_recipe_id;
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  FOR v_item IN
    SELECT product_id, quantity FROM treatment_recipe_items WHERE recipe_id = v_recipe_id
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      CONTINUE;
    END IF;
    BEGIN
      PERFORM deduct_inventory_fifo(
        v_item.product_id, v_item.quantity, v_appt.branch_id,
        'appointment', p_appointment_id::text,
        'Treatment consumption: ' || coalesce(v_recipe_name, 'unknown'),
        'Auto-deducted at treatment start',
        auth.uid(), v_user_email
      );
      v_deducted_any := true;
    EXCEPTION WHEN OTHERS THEN
      SELECT name INTO v_product_name FROM inventory_products WHERE id = v_item.product_id;
      v_issues := v_issues || (coalesce(v_product_name, 'Unknown product') || ': ' || SQLERRM);
    END;
  END LOOP;

  IF NOT v_deducted_any AND array_length(v_issues, 1) IS NULL THEN
    v_issues := v_issues || ('Recipe "' || coalesce(v_recipe_name, 'unknown') || '" has no components, so nothing was deducted.');
  END IF;

  UPDATE appointments
  SET inventory_deducted_at = now(),
      inventory_deducted_recipe_id = v_recipe_id,
      inventory_deduction_issues = CASE WHEN array_length(v_issues, 1) IS NULL THEN NULL ELSE v_issues END
  WHERE id = p_appointment_id;
END;
$function$;
