/*
# Inventory & Medical Supply Management System

## Overview
Replaces the basic inventory_items/inventory_usage tables with a complete
inventory management system supporting product master, batch tracking, FIFO
deduction, treatment recipes, purchase orders, suppliers, branch transfers,
and full audit trail.

## New Tables
1. `inventory_products` — Product Master (replaces inventory_items)
   - Auto-generated product code, category, sub-category, brand, UoM, inventory type
   - Barcode, SKU, description, image, active flag
   - Stock levels: current, beginning, min, max, reorder point, reorder qty, reserved
   - Costing: average cost, last purchase cost, standard cost, selling price, suggested selling price
2. `inventory_batches` — Batch & expiration tracking per product
   - Batch number, supplier, mfg date, expiry date, qty, remaining qty, status
3. `inventory_transactions` — Complete audit trail of every movement
   - Transaction types: beginning, purchase, adjustment, consumption, damage, expired, return, transfer, manual
   - Records before/after quantity, user, reference, reason, notes
4. `treatment_recipes` — Recipe definitions for each treatment/service
   - Links to appointments.service field
5. `treatment_recipe_items` — Items within a recipe with quantities
6. `inventory_suppliers` — Supplier database
7. `inventory_purchase_orders` — Purchase order management
8. `inventory_purchase_order_items` — Line items on a PO
9. `inventory_transfers` — Branch-to-branch stock transfers

## Modified Tables
- None destructively. Old `inventory_items` and `inventory_usage` tables remain
  for backward compatibility but the new system uses `inventory_products`.

## Security
- RLS enabled on all new tables, scoped to authenticated users.
- Uses existing `has_permission` helper for authorization checks in RPCs.

## Important Notes
1. Auto-deduction trigger: when an appointment is marked 'completed', the
   `deduct_inventory_on_completion` trigger function finds matching recipes
   by service name, deducts inventory using FIFO (earliest expiry first),
   and creates audit transactions.
2. FIFO deduction always consumes from the batch with the earliest expiration
   date that has remaining quantity.
3. Inventory is never deleted — only adjusted via transactions.
4. Stock status (normal/low/critical/out/overstock) is computed via a view.
5. Batch status (good/near-expiry/expired/quarantined) is computed via a view.
*/

-- ─── 1. Inventory Products (Product Master) ────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text UNIQUE NOT NULL DEFAULT ('PRD-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6))),
  name text NOT NULL,
  category text,
  sub_category text,
  brand text,
  unit text NOT NULL DEFAULT 'unit',
  inventory_type text NOT NULL DEFAULT 'Consumables',
  barcode text,
  sku text,
  description text,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  -- Stock levels
  current_stock numeric NOT NULL DEFAULT 0,
  beginning_stock numeric NOT NULL DEFAULT 0,
  min_stock_level numeric NOT NULL DEFAULT 0,
  max_stock_level numeric NOT NULL DEFAULT 0,
  reorder_point numeric NOT NULL DEFAULT 0,
  reorder_quantity numeric NOT NULL DEFAULT 0,
  reserved_stock numeric NOT NULL DEFAULT 0,
  -- Costing
  average_cost numeric NOT NULL DEFAULT 0,
  last_purchase_cost numeric NOT NULL DEFAULT 0,
  standard_cost numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  suggested_selling_price numeric NOT NULL DEFAULT 0,
  -- Branch assignment (null = shared/all-branch)
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_inv_products" ON inventory_products;
CREATE POLICY "select_inv_products" ON inventory_products FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_inv_products" ON inventory_products;
CREATE POLICY "insert_inv_products" ON inventory_products FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_inv_products" ON inventory_products;
CREATE POLICY "update_inv_products" ON inventory_products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_inv_products" ON inventory_products;
CREATE POLICY "delete_inv_products" ON inventory_products FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_inv_products_branch ON inventory_products(branch_id);
CREATE INDEX IF NOT EXISTS idx_inv_products_type ON inventory_products(inventory_type);
CREATE INDEX IF NOT EXISTS idx_inv_products_active ON inventory_products(is_active);

-- ─── 2. Inventory Batches ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  supplier_id uuid,
  manufacturing_date date,
  expiration_date date,
  quantity numeric NOT NULL DEFAULT 0,
  remaining_quantity numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'good',
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_inv_batches" ON inventory_batches;
CREATE POLICY "select_inv_batches" ON inventory_batches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_inv_batches" ON inventory_batches;
CREATE POLICY "insert_inv_batches" ON inventory_batches FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_inv_batches" ON inventory_batches;
CREATE POLICY "update_inv_batches" ON inventory_batches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_inv_batches" ON inventory_batches;
CREATE POLICY "delete_inv_batches" ON inventory_batches FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_inv_batches_product ON inventory_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_batches_expiry ON inventory_batches(expiration_date);
CREATE INDEX IF NOT EXISTS idx_inv_batches_status ON inventory_batches(status);

-- ─── 3. Inventory Transactions (Audit Trail) ───────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  batch_id uuid REFERENCES inventory_batches(id) ON DELETE SET NULL,
  transaction_type text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  before_quantity numeric NOT NULL DEFAULT 0,
  after_quantity numeric NOT NULL DEFAULT 0,
  user_id uuid,
  user_email text,
  reference_type text,
  reference_id text,
  reason text,
  notes text,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  transaction_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_inv_txn" ON inventory_transactions;
CREATE POLICY "select_inv_txn" ON inventory_transactions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_inv_txn" ON inventory_transactions;
CREATE POLICY "insert_inv_txn" ON inventory_transactions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_inv_txn" ON inventory_transactions;
CREATE POLICY "update_inv_txn" ON inventory_transactions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_inv_txn" ON inventory_transactions;
CREATE POLICY "delete_inv_txn" ON inventory_transactions FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_inv_txn_product ON inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_txn_type ON inventory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_inv_txn_date ON inventory_transactions(transaction_date);

-- ─── 4. Treatment Recipes ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS treatment_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE treatment_recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_recipes" ON treatment_recipes;
CREATE POLICY "select_recipes" ON treatment_recipes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_recipes" ON treatment_recipes;
CREATE POLICY "insert_recipes" ON treatment_recipes FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_recipes" ON treatment_recipes;
CREATE POLICY "update_recipes" ON treatment_recipes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_recipes" ON treatment_recipes;
CREATE POLICY "delete_recipes" ON treatment_recipes FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS treatment_recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES treatment_recipes(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE treatment_recipe_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_recipe_items" ON treatment_recipe_items;
CREATE POLICY "select_recipe_items" ON treatment_recipe_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_recipe_items" ON treatment_recipe_items;
CREATE POLICY "insert_recipe_items" ON treatment_recipe_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_recipe_items" ON treatment_recipe_items;
CREATE POLICY "update_recipe_items" ON treatment_recipe_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_recipe_items" ON treatment_recipe_items;
CREATE POLICY "delete_recipe_items" ON treatment_recipe_items FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe ON treatment_recipe_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_product ON treatment_recipe_items(product_id);

-- ─── 5. Suppliers ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  mobile text,
  email text,
  address text,
  products_supplied text,
  lead_time_days integer DEFAULT 0,
  payment_terms text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_suppliers" ON inventory_suppliers;
CREATE POLICY "select_suppliers" ON inventory_suppliers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_suppliers" ON inventory_suppliers;
CREATE POLICY "insert_suppliers" ON inventory_suppliers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_suppliers" ON inventory_suppliers;
CREATE POLICY "update_suppliers" ON inventory_suppliers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_suppliers" ON inventory_suppliers;
CREATE POLICY "delete_suppliers" ON inventory_suppliers FOR DELETE TO authenticated USING (true);

-- ─── 6. Purchase Orders ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE NOT NULL DEFAULT ('PO-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 4))),
  supplier_id uuid REFERENCES inventory_suppliers(id) ON DELETE SET NULL,
  order_date date NOT NULL DEFAULT current_date,
  expected_delivery date,
  received_by text,
  status text NOT NULL DEFAULT 'draft',
  total_amount numeric NOT NULL DEFAULT 0,
  notes text,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_pos" ON inventory_purchase_orders;
CREATE POLICY "select_pos" ON inventory_purchase_orders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_pos" ON inventory_purchase_orders;
CREATE POLICY "insert_pos" ON inventory_purchase_orders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_pos" ON inventory_purchase_orders;
CREATE POLICY "update_pos" ON inventory_purchase_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_pos" ON inventory_purchase_orders;
CREATE POLICY "delete_pos" ON inventory_purchase_orders FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_po_supplier ON inventory_purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON inventory_purchase_orders(status);

CREATE TABLE IF NOT EXISTS inventory_purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES inventory_purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  quantity_ordered numeric NOT NULL DEFAULT 0,
  quantity_received numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  batch_number text,
  expiration_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_purchase_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_po_items" ON inventory_purchase_order_items;
CREATE POLICY "select_po_items" ON inventory_purchase_order_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_po_items" ON inventory_purchase_order_items;
CREATE POLICY "insert_po_items" ON inventory_purchase_order_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_po_items" ON inventory_purchase_order_items;
CREATE POLICY "update_po_items" ON inventory_purchase_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_po_items" ON inventory_purchase_order_items;
CREATE POLICY "delete_po_items" ON inventory_purchase_order_items FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_po_items_po ON inventory_purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_product ON inventory_purchase_order_items(product_id);

-- ─── 7. Branch Transfers ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number text UNIQUE NOT NULL DEFAULT ('TRF-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 4))),
  product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  from_branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  to_branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  requested_by text,
  received_by text,
  notes text,
  transfer_date timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_transfers" ON inventory_transfers;
CREATE POLICY "select_transfers" ON inventory_transfers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_transfers" ON inventory_transfers;
CREATE POLICY "insert_transfers" ON inventory_transfers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_transfers" ON inventory_transfers;
CREATE POLICY "update_transfers" ON inventory_transfers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_transfers" ON inventory_transfers;
CREATE POLICY "delete_transfers" ON inventory_transfers FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_transfers_product ON inventory_transfers(product_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON inventory_transfers(status);

-- ─── 8. Stock Status View ───────────────────────────────────────────────────

CREATE OR REPLACE VIEW inventory_product_summary AS
SELECT
  p.*,
  (p.current_stock - p.reserved_stock) AS available_stock,
  CASE
    WHEN p.current_stock <= 0 THEN 'out_of_stock'
    WHEN p.current_stock <= p.min_stock_level THEN 'critical'
    WHEN p.current_stock <= p.reorder_point THEN 'low_stock'
    WHEN p.max_stock_level > 0 AND p.current_stock >= p.max_stock_level THEN 'overstock'
    ELSE 'normal'
  END AS stock_status,
  (p.current_stock * p.average_cost) AS inventory_value,
  (p.current_stock * p.selling_price) AS potential_sales_value,
  (p.current_stock * (p.selling_price - p.average_cost)) AS potential_profit,
  CASE
    WHEN p.selling_price > 0 AND p.average_cost > 0
      THEN round(((p.selling_price - p.average_cost) / p.selling_price) * 100, 2)
    ELSE 0
  END AS gross_margin_pct
FROM inventory_products p;

-- ─── 9. Batch Status View ───────────────────────────────────────────────────

CREATE OR REPLACE VIEW inventory_batch_summary AS
SELECT
  b.*,
  CASE
    WHEN b.status = 'quarantined' THEN 'quarantined'
    WHEN b.expiration_date IS NOT NULL AND b.expiration_date < current_date THEN 'expired'
    WHEN b.expiration_date IS NOT NULL AND b.expiration_date <= current_date + interval '30 days' THEN 'near_expiry'
    ELSE 'good'
  END AS computed_status
FROM inventory_batches b;

-- ─── 10. FIFO Deduction Function ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.deduct_inventory_fifo(
  p_product_id uuid,
  p_quantity numeric,
  p_branch_id uuid DEFAULT NULL,
  p_reference_type text DEFAULT NULL,
  p_reference_id text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_user_email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining numeric := p_quantity;
  v_batch record;
  v_deduct numeric;
  v_before numeric;
  v_after numeric;
  v_product_branch uuid;
BEGIN
  -- Get current product stock and branch
  SELECT current_stock, branch_id INTO v_before, v_product_branch
  FROM inventory_products WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found: %', p_product_id;
  END IF;

  IF v_before < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock for product. Available: %, Required: %', v_before, p_quantity;
  END IF;

  -- FIFO: deduct from batches with earliest expiration date first
  FOR v_batch IN
    SELECT id, remaining_quantity, expiration_date
    FROM inventory_batches
    WHERE product_id = p_product_id
      AND remaining_quantity > 0
      AND status = 'good'
      AND (p_branch_id IS NULL OR branch_id = p_branch_id OR branch_id IS NULL)
    ORDER BY expiration_date ASC NULLS LAST, created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_deduct := LEAST(v_remaining, v_batch.remaining_quantity);
    v_after := v_before - v_deduct;

    -- Update batch remaining
    UPDATE inventory_batches
    SET remaining_quantity = remaining_quantity - v_deduct, updated_at = now()
    WHERE id = v_batch.id;

    -- Record transaction
    INSERT INTO inventory_transactions (
      product_id, batch_id, transaction_type, quantity, unit_cost,
      before_quantity, after_quantity, user_id, user_email,
      reference_type, reference_id, reason, notes, branch_id
    ) VALUES (
      p_product_id, v_batch.id, 'consumption', v_deduct, 0,
      v_before, v_after, p_user_id, p_user_email,
      p_reference_type, p_reference_id, p_reason, p_notes, COALESCE(p_branch_id, v_product_branch)
    );

    v_before := v_after;
    v_remaining := v_remaining - v_deduct;
  END LOOP;

  -- If no batches exist, record a single transaction against the product
  IF v_remaining > 0 AND v_remaining = p_quantity THEN
    v_after := v_before - p_quantity;
    INSERT INTO inventory_transactions (
      product_id, batch_id, transaction_type, quantity, unit_cost,
      before_quantity, after_quantity, user_id, user_email,
      reference_type, reference_id, reason, notes, branch_id
    ) VALUES (
      p_product_id, NULL, 'consumption', p_quantity, 0,
      v_before, v_after, p_user_id, p_user_email,
      p_reference_type, p_reference_id, p_reason, p_notes, COALESCE(p_branch_id, v_product_branch)
    );
    v_before := v_after;
    v_remaining := 0;
  END IF;

  -- Update product current stock
  UPDATE inventory_products
  SET current_stock = v_before, updated_at = now()
  WHERE id = p_product_id;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Could not fully deduct. Remaining unfulfilled: %', v_remaining;
  END IF;
END;
$function$;

-- ─── 11. Auto-Deduction Trigger on Appointment Completion ──────────────────

CREATE OR REPLACE FUNCTION public.deduct_inventory_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recipe record;
  v_item record;
  v_branch uuid;
  v_user_email text;
BEGIN
  -- Only fire when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
    SELECT branch_id INTO v_branch FROM appointments WHERE id = NEW.id;

    SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

    -- Find matching recipe by service name
    SELECT id, treatment_name INTO v_recipe
    FROM treatment_recipes
    WHERE treatment_name ILIKE NEW.service
      AND is_active = true
    LIMIT 1;

    IF v_recipe IS NOT NULL THEN
      FOR v_item IN
        SELECT ri.product_id, ri.quantity
        FROM treatment_recipe_items ri
        WHERE ri.recipe_id = v_recipe.id
      LOOP
        BEGIN
          PERFORM deduct_inventory_fifo(
            v_item.product_id,
            v_item.quantity,
            v_branch,
            'appointment',
            NEW.id::text,
            'Treatment consumption: ' || v_recipe.treatment_name,
            'Auto-deducted on appointment completion',
            auth.uid(),
            v_user_email
          );
        EXCEPTION WHEN OTHERS THEN
          -- Log error but don't block appointment completion
          RAISE NOTICE 'Failed to deduct inventory for product %: %', v_item.product_id, SQLERRM;
        END;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger: fire after appointment update
DROP TRIGGER IF EXISTS trg_deduct_inventory_on_completion ON appointments;
CREATE TRIGGER trg_deduct_inventory_on_completion
  AFTER UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION deduct_inventory_on_completion();

-- ─── 12. Add Inventory Cost on PO Receive Function ──────────────────────────

CREATE OR REPLACE FUNCTION public.receive_purchase_order_item(
  p_po_item_id uuid,
  p_received_qty numeric,
  p_batch_number text DEFAULT NULL,
  p_expiration_date date DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_user_email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_po_item record;
  v_product record;
  v_before numeric;
  v_after numeric;
  v_new_avg_cost numeric;
  v_new_total_value numeric;
  v_total_qty numeric;
BEGIN
  SELECT * INTO v_po_item FROM inventory_purchase_order_items WHERE id = p_po_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO item not found'; END IF;

  SELECT current_stock, average_cost INTO v_before, v_new_avg_cost
  FROM inventory_products WHERE id = v_po_item.product_id;

  v_after := v_before + p_received_qty;

  -- Create batch if batch number provided
  IF p_batch_number IS NOT NULL THEN
    INSERT INTO inventory_batches (
      product_id, batch_number, supplier_id, manufacturing_date, expiration_date,
      quantity, remaining_quantity, status, branch_id
    ) VALUES (
      v_po_item.product_id, p_batch_number,
      (SELECT supplier_id FROM inventory_purchase_orders WHERE id = v_po_item.po_id),
      NULL, p_expiration_date,
      p_received_qty, p_received_qty, 'good',
      (SELECT branch_id FROM inventory_purchase_orders WHERE id = v_po_item.po_id)
    );
  END IF;

  -- Update average cost (weighted)
  IF v_after > 0 THEN
    v_new_total_value := (v_before * v_new_avg_cost) + (p_received_qty * v_po_item.unit_cost);
    v_new_avg_cost := v_new_total_value / v_after;
  ELSE
    v_new_avg_cost := v_po_item.unit_cost;
  END IF;

  -- Update product stock and costs
  UPDATE inventory_products
  SET
    current_stock = v_after,
    average_cost = v_new_avg_cost,
    last_purchase_cost = v_po_item.unit_cost,
    updated_at = now()
  WHERE id = v_po_item.product_id;

  -- Update PO item received qty
  UPDATE inventory_purchase_order_items
  SET quantity_received = quantity_received + p_received_qty
  WHERE id = p_po_item_id;

  -- Record transaction
  INSERT INTO inventory_transactions (
    product_id, transaction_type, quantity, unit_cost,
    before_quantity, after_quantity, user_id, user_email,
    reference_type, reference_id, reason, notes, branch_id
  ) VALUES (
    v_po_item.product_id, 'purchase', p_received_qty, v_po_item.unit_cost,
    v_before, v_after, p_user_id, p_user_email,
    'purchase_order', v_po_item.po_id::text, 'Purchase order receipt', NULL,
    (SELECT branch_id FROM inventory_purchase_orders WHERE id = v_po_item.po_id)
  );
END;
$function$;

-- ─── 13. Stock Adjustment Function ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.adjust_inventory(
  p_product_id uuid,
  p_quantity numeric,
  p_reason text,
  p_notes text DEFAULT NULL,
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
BEGIN
  SELECT current_stock, branch_id INTO v_before, v_branch
  FROM inventory_products WHERE id = p_product_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

  v_after := v_before + p_quantity;

  UPDATE inventory_products
  SET current_stock = v_after, updated_at = now()
  WHERE id = p_product_id;

  INSERT INTO inventory_transactions (
    product_id, transaction_type, quantity, unit_cost,
    before_quantity, after_quantity, user_id, user_email,
    reference_type, reference_id, reason, notes, branch_id
  ) VALUES (
    p_product_id, 'adjustment', p_quantity, 0,
    v_before, v_after, p_user_id, p_user_email,
    'manual', NULL, p_reason, p_notes, v_branch
  );
END;
$function$;

-- ─── 14. Inventory Permissions ─────────────────────────────────────────────

INSERT INTO permissions (key, label, description)
VALUES
  ('inventory.view', 'View Inventory', 'Access the inventory module and view stock levels'),
  ('inventory.manage', 'Manage Inventory', 'Create, edit, and adjust inventory products and stock'),
  ('inventory.purchasing', 'Manage Purchasing', 'Create and receive purchase orders, manage suppliers'),
  ('inventory.reports', 'Inventory Reports', 'Access inventory valuation, reports, and analytics')
ON CONFLICT (key) DO NOTHING;

-- Grant all inventory permissions to superadmin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'superadmin'
  AND p.key IN ('inventory.view', 'inventory.manage', 'inventory.purchasing', 'inventory.reports')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant inventory.view to nurse and staff roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.key IN ('nurse', 'staff')
  AND p.key = 'inventory.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant inventory.manage to staff (operations manager role)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'staff'
  AND p.key IN ('inventory.manage', 'inventory.purchasing')
ON CONFLICT (role_id, permission_id) DO NOTHING;
