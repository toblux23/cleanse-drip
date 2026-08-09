/*
# Add photo capture to attendance (time_logs)

## Schema Changes
- Adds `clock_in_photo_url` and `clock_out_photo_url` text columns to `time_logs`
  to store Supabase Storage public URLs for clock-in/clock-out verification photos.

## Storage
- Creates `attendance-photos` bucket (public read, authenticated write)
- RLS policies: authenticated users can upload; public can read.

## RLS on time_logs
- No changes needed — existing policies already cover INSERT (clock in) and
  UPDATE (clock out). The new columns are nullable and inherit the table's
  existing RLS behavior.
*/

-- ─── Add photo URL columns to time_logs ────────────────────────────────────────

ALTER TABLE time_logs
  ADD COLUMN IF NOT EXISTS clock_in_photo_url text,
  ADD COLUMN IF NOT EXISTS clock_out_photo_url text;

-- ─── Create attendance-photos storage bucket ──────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('attendance-photos', 'attendance-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ─── Storage RLS policies ──────────────────────────────────────────────────────

-- Allow authenticated users to upload attendance photos
DROP POLICY IF EXISTS "auth_upload_attendance_photos" ON storage.objects;
CREATE POLICY "auth_upload_attendance_photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attendance-photos');

-- Allow public to read attendance photos (bucket is public)
DROP POLICY IF EXISTS "auth_read_attendance_photos" ON storage.objects;
CREATE POLICY "auth_read_attendance_photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'attendance-photos');

-- Allow authenticated users to delete their own uploads
DROP POLICY IF EXISTS "auth_delete_attendance_photos" ON storage.objects;
CREATE POLICY "auth_delete_attendance_photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'attendance-photos' AND owner_id = auth.uid()::text);
