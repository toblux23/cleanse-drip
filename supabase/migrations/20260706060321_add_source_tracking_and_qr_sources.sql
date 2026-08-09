-- Add source attribution to bookings
ALTER TABLE public.client_bookings
  ADD COLUMN IF NOT EXISTS source text;

CREATE INDEX IF NOT EXISTS client_bookings_source_idx ON public.client_bookings (source);

-- QR source management table
CREATE TABLE IF NOT EXISTS public.qr_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'branch' CHECK (type IN ('branch','event','social_media','partner','walkin','other')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS qr_sources_name_lower_idx ON public.qr_sources (lower(name));
CREATE INDEX IF NOT EXISTS qr_sources_is_active_idx ON public.qr_sources (is_active);

ALTER TABLE public.qr_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_qr_sources" ON public.qr_sources FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "auth_insert_qr_sources" ON public.qr_sources FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_qr_sources" ON public.qr_sources FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_delete_qr_sources" ON public.qr_sources FOR DELETE
  TO authenticated USING (true);
