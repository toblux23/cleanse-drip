/*
# Add Initial Stock RPC

1. Purpose
- Provides a transaction-based way to record opening-balance (initial) stock for a product.
- Mirrors the existing `adjust_inventory` pattern: updates `current_stock` and inserts an `inventory_transactions` row.
- Uses the existing `beginning` transaction_type (already defined in the app's InventoryTransactionType union).
- Does NOT alter existing inventory calculations or tables; reuses `inventory_products` and `inventory_transactions`.

2. New Functions
- `add_initial_stock(p_product_id, p_quantity, p_unit_cost, p_reference_number, p_remarks, p_reason, p_branch_id, p_user_id, p_user_email)`
  - Validates quantity > 0.
  - Reads current `current_stock` as `before_quantity`.
  - Sets `current_stock = before + quantity` (additive, so initial stock can be recorded for products that already have stock from other sources).
  - Inserts an `inventory_transactions` row with `transaction_type = 'beginning'`, `reference_type = 'initial_stock'`, `reference_id = p_reference_number`, `reason = p_reason`, `notes = p_remarks`, `unit_cost = p_unit_cost`, `branch_id = p_branch_id` (falls back to product's branch if null).
  - Updates `average_cost` using a weighted average when `p_unit_cost > 0`.

3. Security
- Function is SECURITY DEFINER (same as `adjust_inventory`) so it can run with the caller's auth context while updating inventory_products.
- No new tables; no RLS policy changes needed.

4. Notes
- Idempotent via `CREATE OR REPLACE FUNCTION`.
- Safe to re-run.
*/

CREATE OR REPLACE FUNCTION public.add_initial_stock(
  p_product_id uuid,
  p_quantity numeric,
  p_unit_cost numeric DEFAULT 0,
  p_reference_number text DEFAULT NULL,
  p_remarks text DEFAULT NULL,
  p_reason text DEFAULT 'Opening Balance',
  p_branch_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_user_email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_before numeric;
  v_after numeric;
  v_branch uuid;
  v_current_avg numeric;
  v_new_avg numeric;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Initial stock quantity must be greater than zero';
  END IF;

  SELECT current_stock, branch_id, average_cost
  INTO v_before, v_branch, v_current_avg
  FROM inventory_products WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  v_after := v_before + p_quantity;
  v_branch := COALESCE(p_branch_id, v_branch);

  -- Weighted average cost when a unit cost is provided
  IF p_unit_cost > 0 AND v_after > 0 THEN
    v_new_avg := ((v_before * COALESCE(v_current_avg, 0)) + (p_quantity * p_unit_cost)) / v_after;
  ELSE
    v_new_avg := COALESCE(v_current_avg, 0);
  END IF;

  UPDATE inventory_products
  SET current_stock = v_after,
      average_cost = v_new_avg,
      beginning_stock = CASE WHEN beginning_stock = 0 THEN v_after ELSE beginning_stock END,
      updated_at = now()
  WHERE id = p_product_id;

  INSERT INTO inventory_transactions (
    product_id, transaction_type, quantity, unit_cost,
    before_quantity, after_quantity, user_id, user_email,
    reference_type, reference_id, reason, notes, branch_id
  ) VALUES (
    p_product_id, 'beginning', p_quantity, COALESCE(p_unit_cost, 0),
    v_before, v_after, p_user_id, p_user_email,
    'initial_stock', p_reference_number, p_reason, p_remarks, v_branch
  );
END;
$function$;
