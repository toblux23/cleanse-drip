-- Product & Package Management: central catalog
-- Reuses treatment_recipes / treatment_recipe_items / inventory_products.
-- Adds a unified catalog_items table as the single source of truth.

-- ─── Categories ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Catalog items (IV drips, peptides, add-ons, session packages, physical products) ─
CREATE TABLE IF NOT EXISTS catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  internal_code text UNIQUE,
  category_id uuid REFERENCES catalog_categories(id) ON DELETE SET NULL,
  item_type text NOT NULL CHECK (
    item_type IN ('iv_drip','peptide','add_on','session_package','physical_product')
  ),
  short_description text,
  full_description text,
  selling_price numeric NOT NULL DEFAULT 0,
  cost numeric,
  taxable boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  image_url text,
  duration_minutes integer,
  inventory_tracking_enabled boolean NOT NULL DEFAULT false,
  inventory_product_id uuid REFERENCES inventory_products(id) ON DELETE SET NULL,
  -- Session package fields (nullable for non-package types)
  paid_sessions integer,
  free_sessions integer,
  total_usable_sessions integer GENERATED ALWAYS AS (COALESCE(paid_sessions,0) + COALESCE(free_sessions,0)) STORED,
  validity_days integer,
  transferable boolean,
  terms_notes text,
  included_catalog_item_id uuid REFERENCES catalog_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS catalog_items_category_id_idx ON catalog_items(category_id);
CREATE INDEX IF NOT EXISTS catalog_items_item_type_idx ON catalog_items(item_type);
CREATE INDEX IF NOT EXISTS catalog_items_is_active_idx ON catalog_items(is_active);

-- ─── Link recipes to catalog items ────────────────────────────────────────
ALTER TABLE treatment_recipes
  ADD COLUMN IF NOT EXISTS catalog_item_id uuid REFERENCES catalog_items(id) ON DELETE SET NULL;

-- ─── Enhance recipe items ──────────────────────────────────────────────────
ALTER TABLE treatment_recipe_items
  ADD COLUMN IF NOT EXISTS unit_of_measure text,
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_substitution boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waste_allowance numeric;

-- ─── Permissions ───────────────────────────────────────────────────────────
INSERT INTO permissions (key, label) VALUES
  ('catalog.view', 'View Product Catalog'),
  ('catalog.create', 'Create Products and Packages'),
  ('catalog.edit', 'Edit Products and Packages'),
  ('catalog.activate', 'Activate or Deactivate Products'),
  ('catalog.manage_pricing', 'Manage Pricing'),
  ('catalog.manage_recipes', 'Manage Inventory Recipes'),
  ('catalog.manage_categories', 'Manage Categories')
ON CONFLICT (key) DO NOTHING;

-- Grant all catalog permissions to superadmin and nurse roles by default.
-- (role_permissions links role_id+permission_id; app also enforces via can().)
DO $$
DECLARE
  r_id int;
  p_id int;
BEGIN
  -- superadmin
  SELECT id INTO r_id FROM roles WHERE key = 'superadmin' LIMIT 1;
  IF r_id IS NOT NULL THEN
    FOR p_id IN SELECT id FROM permissions WHERE key LIKE 'catalog.%' LOOP
      INSERT INTO role_permissions (role_id, permission_id) VALUES (r_id, p_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  -- nurse (view + manage recipes only)
  SELECT id INTO r_id FROM roles WHERE key = 'nurse' LIMIT 1;
  IF r_id IS NOT NULL THEN
    FOR p_id IN SELECT id FROM permissions WHERE key IN ('catalog.view','catalog.manage_recipes') LOOP
      INSERT INTO role_permissions (role_id, permission_id) VALUES (r_id, p_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END $$;

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE catalog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;

-- Catalog is readable by all authenticated staff; writes gated by app permissions.
CREATE POLICY "read_catalog_categories" ON catalog_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_catalog_categories" ON catalog_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_catalog_items" ON catalog_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_catalog_items" ON catalog_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow authenticated to read/update recipes & recipe items (already exist; add permissive if not present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='treatment_recipes' AND policyname='rw_recipes_authenticated'
  ) THEN
    ALTER TABLE treatment_recipes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "rw_recipes_authenticated" ON treatment_recipes
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='treatment_recipe_items' AND policyname='rw_recipe_items_authenticated'
  ) THEN
    ALTER TABLE treatment_recipe_items ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "rw_recipe_items_authenticated" ON treatment_recipe_items
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── updated_at triggers ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalog_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS catalog_items_updated_at ON catalog_items;
CREATE TRIGGER catalog_items_updated_at BEFORE UPDATE ON catalog_items
  FOR EACH ROW EXECUTE FUNCTION catalog_set_updated_at();

DROP TRIGGER IF EXISTS catalog_categories_updated_at ON catalog_categories;
CREATE TRIGGER catalog_categories_updated_at BEFORE UPDATE ON catalog_categories
  FOR EACH ROW EXECUTE FUNCTION catalog_set_updated_at();
