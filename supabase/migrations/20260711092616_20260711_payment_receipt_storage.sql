-- Add receipt URL column to appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_receipt_url text;

-- Create storage bucket for payment receipts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-receipts',
  'payment-receipts',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
DO $$ BEGIN

  DROP POLICY IF EXISTS "auth_insert_payment_receipts" ON storage.objects;
  DROP POLICY IF EXISTS "auth_select_payment_receipts" ON storage.objects;
  DROP POLICY IF EXISTS "auth_update_payment_receipts" ON storage.objects;
  DROP POLICY IF EXISTS "auth_delete_payment_receipts" ON storage.objects;

  CREATE POLICY "auth_insert_payment_receipts" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'payment-receipts');

  CREATE POLICY "auth_select_payment_receipts" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'payment-receipts');

  CREATE POLICY "auth_update_payment_receipts" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'payment-receipts');

  CREATE POLICY "auth_delete_payment_receipts" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'payment-receipts');

END $$;
