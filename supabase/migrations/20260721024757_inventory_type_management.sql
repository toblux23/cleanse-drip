/*
# Inventory Type Management

1. Purpose
   Adds normalized storage for inventory types so authorized users can manage them
   from the UI instead of relying on a hardcoded array. The required initial
   active types are: Supplements, Medicines, Peptides, Consumables, Equipments,
   Office Supplies.

2. New Tables
   - `inventory_types`
     - `id` (uuid, primary key)
     - `name` (text, unique, not null) — inventory type display name
     - `description` (text, nullable) — optional description
     - `is_active` (boolean, default true) — deactivation flag
     - `display_order` (integer, default 0) — ordering
     - `created_at` (timestamptz, default now())
     - `updated_at` (timestamptz, default now())

3. Seed Data
   Seeds the 6 required inventory types: Supplements, Medicines, Peptides,
   Consumables, Equipments, Office Supplies.
   Existing product values 'Drips' (15 products) and 'IV Vitamins' (3 products)
   are NOT in the required list and are intentionally NOT seeded. Those products
   keep their current values; no automatic data migration is performed.

4. Security
   - RLS enabled on `inventory_types`.
   - SELECT: TO authenticated (any logged-in staff member can read types).
   - INSERT / UPDATE / DELETE: TO authenticated (management gated by frontend permissions).

5. Important Notes
   - `inventory_products.inventory_type` remains a free-text column. The UI stores
     type names (not IDs) into this column, preserving all existing product records.
   - Deletion of an inventory type is blocked by the frontend when products reference it.
   - Deactivation (is_active = false) is always allowed and hides the type from selectors.
*/

CREATE TABLE IF NOT EXISTS inventory_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_inventory_types" ON inventory_types;
CREATE POLICY "select_inventory_types"
  ON inventory_types FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_inventory_types" ON inventory_types;
CREATE POLICY "insert_inventory_types"
  ON inventory_types FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_inventory_types" ON inventory_types;
CREATE POLICY "update_inventory_types"
  ON inventory_types FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_inventory_types" ON inventory_types;
CREATE POLICY "delete_inventory_types"
  ON inventory_types FOR DELETE
  TO authenticated USING (true);

-- Seed the 6 required inventory types.
INSERT INTO inventory_types (name, display_order)
VALUES
  ('Supplements', 1),
  ('Medicines', 2),
  ('Peptides', 3),
  ('Consumables', 4),
  ('Equipments', 5),
  ('Office Supplies', 6)
ON CONFLICT (name) DO NOTHING;
