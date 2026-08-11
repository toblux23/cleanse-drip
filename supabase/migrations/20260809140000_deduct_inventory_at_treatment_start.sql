/*
# Deduct inventory at treatment start, with reversal on service change

## Why
Requested: when the nurse selects the treatment, the linked recipe items should
leave inventory at that moment rather than at completion.

## What was actually happening
Deduction ran TWICE. `trg_deduct_inventory_on_completion` (a database trigger on
appointments) deducted server-side, and `deductInventoryForAppointment` in
NurseDashboardTab deducted again from the client. The client's duplicate guard
reads `inventory_usage`, which the trigger never writes to, so it never caught
the trigger's deduction. Both resolved the recipe by `treatment_name ILIKE
service` — free text — so appointments created by the assistant flow (which
writes `services_requested` joined with ', ') matched no recipe and deducted
nothing at all. Over- and under-deduction, on the same code path.

## Changes
- `appointments.inventory_deducted_at` + `inventory_deducted_recipe_id`:
  explicit deduction state, replacing the ineffective `inventory_usage` guard
- `resolve_treatment_recipe()`: resolves by `catalog_item_id` first, falling
  back to name matching for legacy rows not yet linked
- `apply_treatment_deduction()` / `reverse_treatment_deduction()`
- `trg_treatment_inventory`: deducts when status enters `in_treatment`, and
  reverses + re-applies when the availed service changes after deduction
- `trg_deduct_inventory_on_completion` is dropped. `deduct_inventory_on_completion`
  is rewritten to only consume reservations, which is unrelated to stock movement
  and still belongs at completion.

## Notes
- Deduction is now idempotent via `inventory_deducted_at`. Re-entering
  `in_treatment` will not double-deduct.
- Reversal uses `adjust_inventory` with a positive quantity. This restores
  `current_stock` and writes an audit transaction, but does NOT restore
  `remaining_qty` on the original FIFO batches — the batch a component came from
  is not recorded per-deduction. Stock totals stay correct; batch-level
  attribution after a mid-session service change will not.
- Reversal replays the recipe stored in `inventory_deducted_recipe_id`. If a
  recipe's components are edited between deduction and reversal, the reversal
  follows the CURRENT components of that recipe, not a snapshot.
- The client-side deduction in NurseDashboardTab is removed in the same change.
  Deduction is server-side only, so the nurse and assistant dashboards get
  identical behaviour without either duplicating the logic.
*/

-- ─── Deduction state on appointments ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'inventory_deducted_at'
  ) THEN
    ALTER TABLE appointments ADD COLUMN inventory_deducted_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'inventory_deducted_recipe_id'
  ) THEN
    ALTER TABLE appointments ADD COLUMN inventory_deducted_recipe_id uuid;
  END IF;

  -- Deduction problems the nurse must see. Previously these were RAISE NOTICE
  -- inside an exception handler — invisible to the application, so a treatment
  -- could silently consume nothing.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'inventory_deduction_issues'
  ) THEN
    ALTER TABLE appointments ADD COLUMN inventory_deduction_issues text[];
  END IF;
END $$;

-- ─── Recipe resolution: FK first, name only as fallback ─────────────────────
CREATE OR REPLACE FUNCTION public.resolve_treatment_recipe(
  p_catalog_item_id uuid,
  p_service text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recipe_id uuid;
BEGIN
  IF p_catalog_item_id IS NOT NULL THEN
    SELECT id INTO v_recipe_id
    FROM treatment_recipes
    WHERE catalog_item_id = p_catalog_item_id AND is_active = true
    LIMIT 1;

    IF v_recipe_id IS NOT NULL THEN
      RETURN v_recipe_id;
    END IF;
  END IF;

  -- Legacy fallback: appointments predating the catalog link carry free text.
  -- Only matches a single unambiguous recipe; a multi-service string will not
  -- match, which is correct — guessing would deduct the wrong stock.
  IF p_service IS NOT NULL AND btrim(p_service) <> '' THEN
    SELECT id INTO v_recipe_id
    FROM treatment_recipes
    WHERE treatment_name ILIKE btrim(p_service) AND is_active = true
    LIMIT 1;
  END IF;

  RETURN v_recipe_id;
END;
$function$;

-- ─── Apply deduction ────────────────────────────────────────────────────────
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

-- ─── Reverse deduction (service changed mid-session) ────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_treatment_deduction(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_appt record;
  v_recipe_name text;
  v_item record;
  v_user_email text;
BEGIN
  SELECT id, inventory_deducted_at, inventory_deducted_recipe_id
    INTO v_appt
  FROM appointments WHERE id = p_appointment_id;

  IF NOT FOUND OR v_appt.inventory_deducted_at IS NULL OR v_appt.inventory_deducted_recipe_id IS NULL THEN
    RETURN;
  END IF;

  SELECT treatment_name INTO v_recipe_name FROM treatment_recipes WHERE id = v_appt.inventory_deducted_recipe_id;
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  FOR v_item IN
    SELECT product_id, quantity FROM treatment_recipe_items WHERE recipe_id = v_appt.inventory_deducted_recipe_id
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      CONTINUE;
    END IF;
    BEGIN
      -- adjust_inventory adds the signed quantity, so a positive value restocks.
      PERFORM adjust_inventory(
        v_item.product_id, v_item.quantity,
        'Reversal: service changed from ' || coalesce(v_recipe_name, 'unknown'),
        'Auto-restocked when the availed service was changed',
        auth.uid(), v_user_email
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to restock product % for appointment %: %', v_item.product_id, p_appointment_id, SQLERRM;
    END;
  END LOOP;

  UPDATE appointments
  SET inventory_deducted_at = NULL,
      inventory_deducted_recipe_id = NULL,
      inventory_deduction_issues = NULL
  WHERE id = p_appointment_id;
END;
$function$;

-- ─── Trigger: deduct at treatment start, re-apply on service change ─────────
CREATE OR REPLACE FUNCTION public.handle_treatment_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Deduct when the treatment actually begins.
  IF NEW.status = 'in_treatment' AND (OLD.status IS DISTINCT FROM 'in_treatment') THEN
    PERFORM apply_treatment_deduction(NEW.id);
    RETURN NEW;
  END IF;

  IF NEW.catalog_item_id IS DISTINCT FROM OLD.catalog_item_id THEN
    IF NEW.inventory_deducted_at IS NOT NULL THEN
      -- Client changed their mind after stock already moved: give the old
      -- recipe back, then take the new one.
      PERFORM reverse_treatment_deduction(NEW.id);
      PERFORM apply_treatment_deduction(NEW.id);
    ELSIF NEW.status = 'in_treatment' THEN
      -- Treatment is underway but nothing was deducted — the previous service
      -- had no linked recipe. Correcting the service is the fix, so retry.
      PERFORM apply_treatment_deduction(NEW.id);
    END IF;
    -- Before treatment starts a service change is free: nothing has moved yet.
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_treatment_inventory ON appointments;
CREATE TRIGGER trg_treatment_inventory
  AFTER UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION handle_treatment_inventory();

-- ─── Retire completion-time deduction ───────────────────────────────────────
-- Reservation consumption is not stock movement and still belongs at completion,
-- so the function is kept and narrowed rather than dropped.
DROP TRIGGER IF EXISTS trg_deduct_inventory_on_completion ON appointments;

CREATE OR REPLACE FUNCTION public.deduct_inventory_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
    PERFORM consume_reservation_for_appointment(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_consume_reservation_on_completion ON appointments;
CREATE TRIGGER trg_consume_reservation_on_completion
  AFTER UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION deduct_inventory_on_completion();
