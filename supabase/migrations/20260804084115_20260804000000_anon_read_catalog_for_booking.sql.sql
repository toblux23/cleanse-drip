-- Allow public (anon) read access to catalog categories and active items
-- so the public booking form can dynamically load product categories
-- from Products & Packages as the single source of truth.

CREATE POLICY "anon_read_catalog_categories" ON catalog_categories
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read_catalog_items" ON catalog_items
  FOR SELECT TO anon USING (is_active = true);
