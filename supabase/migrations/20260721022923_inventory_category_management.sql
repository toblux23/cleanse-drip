/*
# Inventory Category & Subcategory Management

1. Purpose
   Adds normalized storage for product categories and subcategories in the Inventory module.
   Previously, categories were a hardcoded array and subcategories were free-text.
   This migration introduces two lookup tables so authorized users can add, edit,
   delete (when unused), and deactivate categories and subcategories from the UI.

2. New Tables
   - `inventory_categories`
     - `id` (uuid, primary key)
     - `name` (text, unique, not null) — category display name
     - `description` (text, nullable) — optional description
     - `is_active` (boolean, default true) — soft-delete / deactivation flag
     - `display_order` (integer, default 0) — ordering
     - `created_at` (timestamptz, default now())
     - `updated_at` (timestamptz, default now())
   - `inventory_subcategories`
     - `id` (uuid, primary key)
     - `category_id` (uuid, FK to inventory_categories, ON DELETE CASCADE)
     - `name` (text, not null) — subcategory display name
     - `description` (text, nullable) — optional description
     - `is_active` (boolean, default true) — soft-delete / deactivation flag
     - `display_order` (integer, default 0) — ordering
     - `created_at` (timestamptz, default now())
     - `updated_at` (timestamptz, default now())
     - Unique constraint on (category_id, name) to prevent duplicates under the same category.

3. Seed Data
   Seeds `inventory_categories` with the existing hardcoded category list so
   current product records continue to resolve to valid category names.
   No subcategories are seeded (existing sub_category values are free-text and vary).

4. Security
   - RLS enabled on both tables.
   - SELECT: TO authenticated (any logged-in staff member can read categories).
   - INSERT / UPDATE / DELETE: TO authenticated (management gated by frontend permissions).
   Note: write access is further restricted by the frontend based on `canManage` permission.

5. Important Notes
   - `inventory_products.category` and `inventory_products.sub_category` remain free-text
     columns. The UI stores category/subcategory *names* (not IDs) into these columns,
   - preserving all existing product records without a data migration.
   - Deletion of a category/subcategory is blocked by the frontend when products reference it.
   - Deactivation (is_active = false) is always allowed and hides the item from selectors.
*/

CREATE TABLE IF NOT EXISTS inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_inventory_categories" ON inventory_categories;
CREATE POLICY "select_inventory_categories"
  ON inventory_categories FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_inventory_categories" ON inventory_categories;
CREATE POLICY "insert_inventory_categories"
  ON inventory_categories FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_inventory_categories" ON inventory_categories;
CREATE POLICY "update_inventory_categories"
  ON inventory_categories FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_inventory_categories" ON inventory_categories;
CREATE POLICY "delete_inventory_categories"
  ON inventory_categories FOR DELETE
  TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS inventory_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES inventory_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, name)
);

ALTER TABLE inventory_subcategories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_inventory_subcategories" ON inventory_subcategories;
CREATE POLICY "select_inventory_subcategories"
  ON inventory_subcategories FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_inventory_subcategories" ON inventory_subcategories;
CREATE POLICY "insert_inventory_subcategories"
  ON inventory_subcategories FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_inventory_subcategories" ON inventory_subcategories;
CREATE POLICY "update_inventory_subcategories"
  ON inventory_subcategories FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_inventory_subcategories" ON inventory_subcategories;
CREATE POLICY "delete_inventory_subcategories"
  ON inventory_subcategories FOR DELETE
  TO authenticated USING (true);

-- Seed existing hardcoded categories so current product records resolve correctly.
INSERT INTO inventory_categories (name, display_order)
VALUES
  ('IV Solutions', 1),
  ('IV Vitamins', 2),
  ('Peptides', 3),
  ('Drips', 4),
  ('Consumables', 5),
  ('Medical Supplies', 6),
  ('Equipment', 7),
  ('PPE', 8),
  ('Retail Products', 9),
  ('Office Supplies', 10),
  ('Other', 11)
ON CONFLICT (name) DO NOTHING;
