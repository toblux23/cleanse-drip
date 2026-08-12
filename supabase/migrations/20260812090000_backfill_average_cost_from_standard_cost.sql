/*
# Backfill average_cost from standard_cost

## Why
`average_cost` drives inventory value, variance value and profit. It is only
written by `receive_purchase_order_item` and `add_initial_stock` — both of which
require stock to move. Opening balances were entered through `adjust_inventory`,
which changes quantity and never touches cost.

Result on the live database: 42 of 63 active products have average_cost = 0, and
35 of those are holding stock. Total inventory value computes to ~PHP 35,920,
which understates reality because most items are valued at zero.

`standard_cost` is already populated with real figures (Tirzepetide 30mg at
1199.95, alcohol pads at 1). This copies those across so the valuation reflects
what the team already entered.

## Changes
- Sets `average_cost = standard_cost` for active products where average_cost is
  0 and standard_cost > 0
- Writes one `inventory_transactions` row per product so the change is auditable
  rather than appearing from nowhere

## Safety rules
Only touches a product when ALL hold:
  1. `average_cost` is 0 or null — never overwrites a cost earned from an actual
     purchase receipt, which is more truthful than a typed standard cost
  2. `standard_cost` > 0 — nothing to copy otherwise
  3. the product is active

## Notes
- Idempotent: after running, the affected rows no longer have average_cost = 0,
  so a re-run matches nothing and writes no further audit rows.
- Quantity is unchanged. The audit rows record quantity 0 with equal
  before/after quantities, marking a cost-only change.
- Products left at zero (no standard_cost) still need a cost set by hand in
  Inventory > Products > Edit > Average Cost.
*/

DO $$
DECLARE
  v_updated integer;
  v_remaining integer;
BEGIN
  -- Audit rows first, so they describe the pre-change state.
  INSERT INTO inventory_transactions (
    product_id, transaction_type, quantity, unit_cost,
    before_quantity, after_quantity,
    reference_type, reason, notes, branch_id
  )
  SELECT
    p.id, 'adjustment', 0, p.standard_cost,
    p.current_stock, p.current_stock,
    'manual',
    'Average cost backfilled from standard cost',
    'Average cost 0 -> ' || p.standard_cost::text,
    p.branch_id
  FROM inventory_products p
  WHERE p.is_active
    AND COALESCE(p.average_cost, 0) = 0
    AND COALESCE(p.standard_cost, 0) > 0;

  UPDATE inventory_products p
  SET average_cost = p.standard_cost,
      updated_at = now()
  WHERE p.is_active
    AND COALESCE(p.average_cost, 0) = 0
    AND COALESCE(p.standard_cost, 0) > 0;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT count(*) INTO v_remaining
  FROM inventory_products
  WHERE is_active AND COALESCE(average_cost, 0) = 0 AND COALESCE(current_stock, 0) > 0;

  RAISE NOTICE 'Average cost backfill: % product(s) updated. % active product(s) still hold stock with no cost.', v_updated, v_remaining;
END $$;
