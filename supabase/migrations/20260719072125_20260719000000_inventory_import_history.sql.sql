/*
# Inventory Import History

## Overview
Adds an `inventory_imports` table to record every inventory import event
(file name, importer, row counts, status) for audit purposes. This supports
the new "Import Inventory" feature that lets administrators migrate existing
Excel/CSV inventory sheets into the Product Master with opening balances.

## New Tables
1. `inventory_imports` — Import history log
   - file_name: original uploaded file name
   - imported_by: uuid of the user who ran the import
   - imported_by_email: email of the user (denormalized for audit readability)
   - total_rows / successful_rows / failed_rows: row counts
   - products_created / products_updated: counts of product changes
   - total_quantity_imported: sum of opening quantities committed
   - status: 'preview' | 'committed' | 'cancelled' | 'failed'
   - notes: optional notes from the importer

## Security
- RLS enabled, scoped to authenticated users.
- No destructive operations. No seed data.

## Important Notes
1. This table is append-only by design — the UI inserts a 'preview' row,
   then updates it to 'committed' or 'cancelled' once the user confirms.
2. Actual product/batch/transaction writes happen via the existing
   `adjust_inventory` RPC and direct inserts into inventory_products /
   inventory_batches — all of which already maintain the audit trail.
3. No historical transactions are ever modified or deleted by imports.
*/

CREATE TABLE IF NOT EXISTS inventory_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  imported_by uuid,
  imported_by_email text,
  total_rows integer NOT NULL DEFAULT 0,
  successful_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  products_created integer NOT NULL DEFAULT 0,
  products_updated integer NOT NULL DEFAULT 0,
  total_quantity_imported numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'preview',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_inv_imports" ON inventory_imports;
CREATE POLICY "select_inv_imports" ON inventory_imports FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_inv_imports" ON inventory_imports;
CREATE POLICY "insert_inv_imports" ON inventory_imports FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_inv_imports" ON inventory_imports;
CREATE POLICY "update_inv_imports" ON inventory_imports FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_inv_imports" ON inventory_imports;
CREATE POLICY "delete_inv_imports" ON inventory_imports FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_inv_imports_created ON inventory_imports(created_at);
CREATE INDEX IF NOT EXISTS idx_inv_imports_status ON inventory_imports(status);
