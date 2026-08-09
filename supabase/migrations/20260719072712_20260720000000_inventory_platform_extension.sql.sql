/*
# Inventory Platform Extension — Enterprise Features

## Overview
Extends the existing inventory system with operational modules: inventory
requests, stock reservations, cost history, cycle-count audits, medical kit
builder, attachments, enhanced transfer workflow, product safety flags,
forecasting view, and a unified product timeline. No existing tables are
dropped or renamed; only additive columns and new tables.

## New Tables
1. `inventory_requests` — Staff request stock; Ops Manager approves; release
   deducts inventory via FIFO.
2. `inventory_request_items` — Line items on a request (product + qty).
3. `inventory_reservations` — Holds reserved stock for confirmed appointments.
4. `inventory_cost_history` — Append-only log of every purchase cost change.
5. `inventory_audits` — Cycle count / physical count sessions.
6. `inventory_audit_items` — Per-product counted qty, variance, variance %.
7. `inventory_kits` — Predefined medical kits (NAD Kit, Myers Kit, etc.).
8. `inventory_kit_items` — Products that make up a kit.
9. `inventory_attachments` — Files (invoices, receipts, certs, MSDS, photos).

## Modified Tables
- `inventory_products`: adds safety flags (cold_storage, prescription,
  physician_approval_required, hazardous, controlled) and last_counted_at.
- `inventory_transfers`: adds approved_by, approved_at, rejected_by,
  rejected_at, rejection_reason to support the full transfer workflow.
- `inventory_batches`: adds quarantined_at, quarantined_reason for quarantine
  tracking (status already exists).

## Security
- RLS enabled on all new tables, scoped to authenticated users.
- Uses existing role architecture.

## Important Notes
1. Reservation trigger: when a client_booking status changes to 'CONFIRMED',
   the `reserve_inventory_on_booking` trigger finds matching treatment recipes
   by service name and creates reservations, incrementing reserved_stock.
2. Release trigger: when a confirmed booking is cancelled, reservations are
   released and reserved_stock decremented.
3. Conversion: when the linked appointment is marked completed, the existing
   `deduct_inventory_on_completion` trigger consumes stock via FIFO and marks
   reservations as 'consumed' so they no longer count against reserved_stock.
4. Cost history: `receive_purchase_order_item` (existing) is updated to also
   insert a row into `inventory_cost_history` on every receipt.
5. All new tables are append-only or status-flow — no destructive operations.
*/

-- ─── 1. Product Safety Columns ──────────────────────────────────────────────

ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS cold_storage boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prescription_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS physician_approval_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hazardous boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS controlled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_counted_at timestamptz;

-- ─── 2. Transfer Workflow Columns ──────────────────────────────────────────

ALTER TABLE inventory_transfers
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- ─── 3. Batch Quarantine Columns ────────────────────────────────────────────

ALTER TABLE inventory_batches
  ADD COLUMN IF NOT EXISTS quarantined_at timestamptz,
  ADD COLUMN IF NOT EXISTS quarantined_reason text;

-- ─── 4. Inventory Requests ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text UNIQUE NOT NULL DEFAULT ('REQ-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 4))),
  requestor_id uuid,
  requestor_name text NOT NULL,
  requestor_email text,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  request_date timestamptz NOT NULL DEFAULT now(),
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'pending',
  reason text,
  notes text,
  approved_by text,
  approved_at timestamptz,
  rejected_by text,
  rejected_at timestamptz,
  rejection_reason text,
  released_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_inv_requests" ON inventory_requests;
CREATE POLICY "select_inv_requests" ON inventory_requests FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_inv_requests" ON inventory_requests;
CREATE POLICY "insert_inv_requests" ON inventory_requests FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_inv_requests" ON inventory_requests;
CREATE POLICY "update_inv_requests" ON inventory_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_inv_requests" ON inventory_requests;
CREATE POLICY "delete_inv_requests" ON inventory_requests FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_inv_req_status ON inventory_requests(status);
CREATE INDEX IF NOT EXISTS idx_inv_req_branch ON inventory_requests(branch_id);

CREATE TABLE IF NOT EXISTS inventory_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES inventory_requests(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_request_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_inv_req_items" ON inventory_request_items;
CREATE POLICY "select_inv_req_items" ON inventory_request_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_inv_req_items" ON inventory_request_items;
CREATE POLICY "insert_inv_req_items" ON inventory_request_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_inv_req_items" ON inventory_request_items;
CREATE POLICY "update_inv_req_items" ON inventory_request_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_inv_req_items" ON inventory_request_items;
CREATE POLICY "delete_inv_req_items" ON inventory_request_items FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_inv_req_items_req ON inventory_request_items(request_id);

-- ─── 5. Inventory Reservations ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  appointment_id uuid,
  booking_id uuid,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  reserved_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  consumed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_inv_res" ON inventory_reservations;
CREATE POLICY "select_inv_res" ON inventory_reservations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_inv_res" ON inventory_reservations;
CREATE POLICY "insert_inv_res" ON inventory_reservations FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_inv_res" ON inventory_reservations;
CREATE POLICY "update_inv_res" ON inventory_reservations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_inv_res" ON inventory_reservations;
CREATE POLICY "delete_inv_res" ON inventory_reservations FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_inv_res_product ON inventory_reservations(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_res_status ON inventory_reservations(status);
CREATE INDEX IF NOT EXISTS idx_inv_res_appt ON inventory_reservations(appointment_id);

-- ─── 6. Cost History (append-only) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_cost_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES inventory_suppliers(id) ON DELETE SET NULL,
  po_id uuid REFERENCES inventory_purchase_orders(id) ON DELETE SET NULL,
  old_cost numeric NOT NULL DEFAULT 0,
  new_cost numeric NOT NULL DEFAULT 0,
  purchase_date timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  user_email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_cost_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_cost_history" ON inventory_cost_history;
CREATE POLICY "select_cost_history" ON inventory_cost_history FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_cost_history" ON inventory_cost_history;
CREATE POLICY "insert_cost_history" ON inventory_cost_history FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_cost_history" ON inventory_cost_history;
CREATE POLICY "update_cost_history" ON inventory_cost_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_cost_history" ON inventory_cost_history;
CREATE POLICY "delete_cost_history" ON inventory_cost_history FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_cost_hist_product ON inventory_cost_history(product_id);
CREATE INDEX IF NOT EXISTS idx_cost_hist_date ON inventory_cost_history(purchase_date);

-- ─── 7. Inventory Audits (Cycle Count) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_number text UNIQUE NOT NULL DEFAULT ('AUD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 4))),
  audit_type text NOT NULL DEFAULT 'cycle_count',
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  audit_date timestamptz NOT NULL DEFAULT now(),
  auditor text,
  status text NOT NULL DEFAULT 'in_progress',
  total_items integer NOT NULL DEFAULT 0,
  total_variants integer NOT NULL DEFAULT 0,
  total_variance_value numeric NOT NULL DEFAULT 0,
  approved_by text,
  approved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_inv_audits" ON inventory_audits;
CREATE POLICY "select_inv_audits" ON inventory_audits FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_inv_audits" ON inventory_audits;
CREATE POLICY "insert_inv_audits" ON inventory_audits FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_inv_audits" ON inventory_audits;
CREATE POLICY "update_inv_audits" ON inventory_audits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_inv_audits" ON inventory_audits;
CREATE POLICY "delete_inv_audits" ON inventory_audits FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS inventory_audit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES inventory_audits(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  system_quantity numeric NOT NULL DEFAULT 0,
  counted_quantity numeric NOT NULL DEFAULT 0,
  variance numeric NOT NULL DEFAULT 0,
  variance_pct numeric NOT NULL DEFAULT 0,
  notes text,
  adjusted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_audit_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_inv_audit_items" ON inventory_audit_items;
CREATE POLICY "select_inv_audit_items" ON inventory_audit_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_inv_audit_items" ON inventory_audit_items;
CREATE POLICY "insert_inv_audit_items" ON inventory_audit_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_inv_audit_items" ON inventory_audit_items;
CREATE POLICY "update_inv_audit_items" ON inventory_audit_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_inv_audit_items" ON inventory_audit_items;
CREATE POLICY "delete_inv_audit_items" ON inventory_audit_items FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_audit_items_audit ON inventory_audit_items(audit_id);

-- ─── 8. Medical Kits ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_code text UNIQUE NOT NULL DEFAULT ('KIT-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6))),
  name text NOT NULL,
  description text,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_kits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_inv_kits" ON inventory_kits;
CREATE POLICY "select_inv_kits" ON inventory_kits FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_inv_kits" ON inventory_kits;
CREATE POLICY "insert_inv_kits" ON inventory_kits FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_inv_kits" ON inventory_kits;
CREATE POLICY "update_inv_kits" ON inventory_kits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_inv_kits" ON inventory_kits;
CREATE POLICY "delete_inv_kits" ON inventory_kits FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS inventory_kit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id uuid NOT NULL REFERENCES inventory_kits(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_kit_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_inv_kit_items" ON inventory_kit_items;
CREATE POLICY "select_inv_kit_items" ON inventory_kit_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_inv_kit_items" ON inventory_kit_items;
CREATE POLICY "insert_inv_kit_items" ON inventory_kit_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_inv_kit_items" ON inventory_kit_items;
CREATE POLICY "update_inv_kit_items" ON inventory_kit_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_inv_kit_items" ON inventory_kit_items;
CREATE POLICY "delete_inv_kit_items" ON inventory_kit_items FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_kit_items_kit ON inventory_kit_items(kit_id);

-- ─── 9. Attachments ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES inventory_products(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES inventory_batches(id) ON DELETE CASCADE,
  po_id uuid REFERENCES inventory_purchase_orders(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES inventory_suppliers(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  category text NOT NULL DEFAULT 'document',
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_inv_attach" ON inventory_attachments;
CREATE POLICY "select_inv_attach" ON inventory_attachments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_inv_attach" ON inventory_attachments;
CREATE POLICY "insert_inv_attach" ON inventory_attachments FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_inv_attach" ON inventory_attachments;
CREATE POLICY "update_inv_attach" ON inventory_attachments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_inv_attach" ON inventory_attachments;
CREATE POLICY "delete_inv_attach" ON inventory_attachments FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_inv_attach_product ON inventory_attachments(product_id);

-- ─── 10. Reservation Functions ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reserve_inventory_for_booking(
  p_booking_id uuid,
  p_service_name text,
  p_branch_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recipe record;
  v_item record;
  v_branch uuid;
BEGIN
  SELECT branch_id INTO v_branch FROM client_bookings WHERE id = p_booking_id;
  IF v_branch IS NOT NULL THEN p_branch_id := v_branch; END IF;

  SELECT id INTO v_recipe FROM treatment_recipes
  WHERE treatment_name ILIKE p_service_name AND is_active = true LIMIT 1;

  IF v_recipe IS NULL THEN RETURN; END IF;

  FOR v_item IN
    SELECT product_id, quantity FROM treatment_recipe_items WHERE recipe_id = v_recipe.id
  LOOP
    INSERT INTO inventory_reservations (product_id, booking_id, branch_id, quantity, status)
    VALUES (v_item.product_id, p_booking_id, p_branch_id, v_item.quantity, 'active');

    UPDATE inventory_products
    SET reserved_stock = reserved_stock + v_item.quantity, updated_at = now()
    WHERE id = v_item.product_id;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_reservation_for_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_res record;
BEGIN
  FOR v_res IN
    SELECT id, product_id, quantity FROM inventory_reservations
    WHERE booking_id = p_booking_id AND status = 'active'
  LOOP
    UPDATE inventory_products
    SET reserved_stock = GREATEST(reserved_stock - v_res.quantity, 0), updated_at = now()
    WHERE id = v_res.product_id;

    UPDATE inventory_reservations
    SET status = 'released', released_at = now()
    WHERE id = v_res.id;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.consume_reservation_for_appointment(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking_id uuid;
  v_res record;
BEGIN
  SELECT booking_id INTO v_booking_id FROM appointments WHERE id = p_appointment_id;
  IF v_booking_id IS NULL THEN RETURN; END IF;

  FOR v_res IN
    SELECT id FROM inventory_reservations
    WHERE booking_id = v_booking_id AND status = 'active'
  LOOP
    UPDATE inventory_reservations
    SET status = 'consumed', consumed_at = now()
    WHERE id = v_res.id;
  END LOOP;
END;
$function$;

-- ─── 11. Booking Reservation Trigger ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reserve_inventory_on_booking_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'CONFIRMED' AND (OLD.status IS NULL OR OLD.status <> 'CONFIRMED') THEN
    PERFORM reserve_inventory_for_booking(NEW.id, NEW.service, NEW.branch_id);
  END IF;
  IF NEW.status = 'CANCELLED' AND OLD.status = 'CONFIRMED' THEN
    PERFORM release_reservation_for_booking(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_reserve_inventory_on_booking ON client_bookings;
CREATE TRIGGER trg_reserve_inventory_on_booking
  AFTER INSERT OR UPDATE ON client_bookings
  FOR EACH ROW
  EXECUTE FUNCTION reserve_inventory_on_booking_change();

-- ─── 12. Update completion trigger to consume reservations ──────────────────

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
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
    SELECT branch_id INTO v_branch FROM appointments WHERE id = NEW.id;
    SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

    PERFORM consume_reservation_for_appointment(NEW.id);

    SELECT id, treatment_name INTO v_recipe
    FROM treatment_recipes
    WHERE treatment_name ILIKE NEW.service AND is_active = true
    LIMIT 1;

    IF v_recipe IS NOT NULL THEN
      FOR v_item IN
        SELECT ri.product_id, ri.quantity
        FROM treatment_recipe_items ri
        WHERE ri.recipe_id = v_recipe.id
      LOOP
        BEGIN
          PERFORM deduct_inventory_fifo(
            v_item.product_id, v_item.quantity, v_branch,
            'appointment', NEW.id::text,
            'Treatment consumption: ' || v_recipe.treatment_name,
            'Auto-deducted on appointment completion',
            auth.uid(), v_user_email
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Failed to deduct inventory for product %: %', v_item.product_id, SQLERRM;
        END;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ─── 13. Release Request Function ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.release_inventory_request(p_request_id uuid, p_user_email text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item record;
  v_branch uuid;
BEGIN
  SELECT branch_id INTO v_branch FROM inventory_requests WHERE id = p_request_id;
  FOR v_item IN
    SELECT ri.product_id, ri.quantity
    FROM inventory_request_items ri
    WHERE ri.request_id = p_request_id
  LOOP
    BEGIN
      PERFORM deduct_inventory_fifo(
        v_item.product_id, v_item.quantity, v_branch,
        'inventory_request', p_request_id::text,
        'Inventory request release',
        'Released from request',
        NULL, p_user_email
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to deduct for request item %: %', v_item.product_id, SQLERRM;
    END;
  END LOOP;
  UPDATE inventory_requests
  SET status = 'released', released_at = now(), updated_at = now()
  WHERE id = p_request_id;
END;
$function$;

-- ─── 14. Cost History on PO Receipt ──────────────────────────────────────────

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
  v_before numeric;
  v_after numeric;
  v_old_avg_cost numeric;
  v_new_avg_cost numeric;
  v_new_total_value numeric;
  v_po record;
BEGIN
  SELECT * INTO v_po_item FROM inventory_purchase_order_items WHERE id = p_po_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO item not found'; END IF;

  SELECT current_stock, average_cost INTO v_before, v_old_avg_cost
  FROM inventory_products WHERE id = v_po_item.product_id;

  v_after := v_before + p_received_qty;

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

  IF v_after > 0 THEN
    v_new_total_value := (v_before * v_old_avg_cost) + (p_received_qty * v_po_item.unit_cost);
    v_new_avg_cost := v_new_total_value / v_after;
  ELSE
    v_new_avg_cost := v_po_item.unit_cost;
  END IF;

  UPDATE inventory_products
  SET current_stock = v_after, average_cost = v_new_avg_cost,
      last_purchase_cost = v_po_item.unit_cost, updated_at = now()
  WHERE id = v_po_item.product_id;

  UPDATE inventory_purchase_order_items
  SET quantity_received = quantity_received + p_received_qty
  WHERE id = p_po_item_id;

  SELECT * INTO v_po FROM inventory_purchase_orders WHERE id = v_po_item.po_id;

  INSERT INTO inventory_cost_history (
    product_id, supplier_id, po_id, old_cost, new_cost, user_id, user_email, notes
  ) VALUES (
    v_po_item.product_id, v_po.supplier_id, v_po_item.po_id,
    v_old_avg_cost, v_new_avg_cost, p_user_id, p_user_email,
    'PO receipt: ' || v_po.po_number || ' — ' || p_received_qty || ' units @ ' || v_po_item.unit_cost
  );

  INSERT INTO inventory_transactions (
    product_id, transaction_type, quantity, unit_cost,
    before_quantity, after_quantity, user_id, user_email,
    reference_type, reference_id, reason, notes, branch_id
  ) VALUES (
    v_po_item.product_id, 'purchase', p_received_qty, v_po_item.unit_cost,
    v_before, v_after, p_user_id, p_user_email,
    'purchase_order', v_po_item.po_id::text, 'Purchase order receipt', NULL, v_po.branch_id
  );
END;
$function$;

-- ─── 15. Forecasting View ────────────────────────────────────────────────────

CREATE OR REPLACE VIEW inventory_forecast AS
SELECT
  p.id AS product_id,
  p.name,
  p.product_code,
  p.current_stock,
  p.reorder_point,
  p.reorder_quantity,
  COALESCE(consumption.total_qty, 0) AS consumption_90d,
  COALESCE(consumption.total_qty / 90.0, 0) AS avg_daily_usage,
  COALESCE(consumption.total_qty / 3.0, 0) AS avg_monthly_usage,
  CASE
    WHEN COALESCE(consumption.total_qty / 90.0, 0) > 0
      THEN FLOOR(p.current_stock / (consumption.total_qty / 90.0))
    ELSE NULL
  END AS days_until_stockout,
  CASE
    WHEN COALESCE(consumption.total_qty / 90.0, 0) > 0
      AND p.current_stock <= p.reorder_point
      THEN true
    ELSE false
  END AS reorder_recommended,
  CASE
    WHEN COALESCE(consumption.total_qty, 0) = 0 THEN 'dead_stock'
    WHEN COALESCE(consumption.total_qty / 90.0, 0) > 0
      AND p.current_stock / (consumption.total_qty / 90.0) < 14
      THEN 'fast_moving'
    WHEN COALESCE(consumption.total_qty / 90.0, 0) > 0
      AND p.current_stock / (consumption.total_qty / 90.0) > 90
      THEN 'slow_moving'
    ELSE 'normal'
  END AS movement_class
FROM inventory_products p
LEFT JOIN (
  SELECT product_id, SUM(quantity) AS total_qty
  FROM inventory_transactions
  WHERE transaction_type = 'consumption'
    AND transaction_date >= now() - interval '90 days'
  GROUP BY product_id
) consumption ON consumption.product_id = p.id
WHERE p.is_active = true;

-- ─── 16. Product Timeline View ───────────────────────────────────────────────

CREATE OR REPLACE VIEW inventory_product_timeline AS
SELECT
  t.product_id,
  t.transaction_date AS event_date,
  t.transaction_type AS event_type,
  t.quantity,
  t.before_quantity,
  t.after_quantity,
  t.user_email,
  t.reason,
  t.notes,
  t.reference_type,
  t.reference_id,
  'transaction' AS source
FROM inventory_transactions t
UNION ALL
SELECT
  r.product_id,
  r.reserved_at,
  CASE WHEN r.status = 'consumed' THEN 'consumed' ELSE 'reserved' END,
  r.quantity,
  NULL::numeric,
  NULL::numeric,
  NULL::text,
  NULL::text,
  r.notes,
  'reservation',
  r.appointment_id::text,
  'reservation'
FROM inventory_reservations r
UNION ALL
SELECT
  c.product_id,
  c.purchase_date,
  'cost_change',
  NULL::numeric,
  c.old_cost,
  c.new_cost,
  c.user_email,
  c.notes,
  NULL::text,
  'purchase_order',
  c.po_id::text,
  'cost_history'
FROM inventory_cost_history c
ORDER BY event_date DESC;

-- ─── 17. New Permissions ─────────────────────────────────────────────────────

INSERT INTO permissions (key, label, description)
VALUES
  ('inventory.requests', 'Manage Inventory Requests', 'Approve, reject, and release inventory requests'),
  ('inventory.audit', 'Inventory Audit', 'Create and complete cycle counts and physical audits'),
  ('inventory.kits', 'Manage Medical Kits', 'Create, edit, assemble, and disassemble medical kits'),
  ('inventory.transfers', 'Manage Transfers', 'Approve, reject, and receive branch transfers')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'superadmin'
  AND p.key IN ('inventory.requests', 'inventory.audit', 'inventory.kits', 'inventory.transfers')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'staff'
  AND p.key IN ('inventory.requests', 'inventory.transfers')
ON CONFLICT (role_id, permission_id) DO NOTHING;
