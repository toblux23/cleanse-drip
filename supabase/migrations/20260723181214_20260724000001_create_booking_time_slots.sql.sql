/*
# Create booking_time_slots table for configurable time slots

## Purpose
Currently, appointment time slots are hardcoded in the frontend (BookingForm.tsx
and ManualEntryModal.tsx). There is no way for authorized staff to add, modify,
remove, or toggle time slots without code changes. This migration creates a
database table to store configurable time slots, seeded with the current defaults.

## New Table
- `booking_time_slots`
  - `id` (uuid, primary key)
  - `slot_time` (time, unique) — the time of day, e.g. '07:00'
  - `label` (text, nullable) — display label, e.g. '7:00 AM'
  - `is_active` (boolean, default true) — inactive slots are hidden from booking UI
  - `display_order` (integer, default 0) — controls sort order in the UI
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz, nullable)

## Seeding
Inserted 30 default slots matching the current hardcoded range: 7:00 AM – 9:30 PM
in 30-minute intervals, with display_order 1–30.

## Security (RLS)
- SELECT: `TO anon, authenticated` with `USING (true)` — the public booking form
  (anon key) must be able to read available slots.
- INSERT/UPDATE/DELETE: `TO authenticated`, restricted to approved team members
  (same pattern as the `clients` table).

## Notes
- If no active slots are found, the frontend falls back to the hardcoded defaults,
  so existing behavior is preserved even if all rows are deactivated.
- The `slot_time` column has a UNIQUE constraint to prevent duplicate slots.
*/

CREATE TABLE IF NOT EXISTS booking_time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_time time NOT NULL UNIQUE,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

ALTER TABLE booking_time_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_time_slots" ON booking_time_slots;
CREATE POLICY "read_time_slots" ON booking_time_slots FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_time_slots" ON booking_time_slots;
CREATE POLICY "insert_time_slots" ON booking_time_slots FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved')
  );

DROP POLICY IF EXISTS "update_time_slots" ON booking_time_slots;
CREATE POLICY "update_time_slots" ON booking_time_slots FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'))
  WITH CHECK (EXISTS (SELECT 1 FROM team_members WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'));

DROP POLICY IF EXISTS "delete_time_slots" ON booking_time_slots;
CREATE POLICY "delete_time_slots" ON booking_time_slots FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'));

-- Seed default slots (7:00 AM – 9:30 PM, 30-min intervals)
INSERT INTO booking_time_slots (slot_time, label, display_order) VALUES
  ('07:00', '7:00 AM', 1),
  ('07:30', '7:30 AM', 2),
  ('08:00', '8:00 AM', 3),
  ('08:30', '8:30 AM', 4),
  ('09:00', '9:00 AM', 5),
  ('09:30', '9:30 AM', 6),
  ('10:00', '10:00 AM', 7),
  ('10:30', '10:30 AM', 8),
  ('11:00', '11:00 AM', 9),
  ('11:30', '11:30 AM', 10),
  ('12:00', '12:00 PM', 11),
  ('12:30', '12:30 PM', 12),
  ('13:00', '1:00 PM', 13),
  ('13:30', '1:30 PM', 14),
  ('14:00', '2:00 PM', 15),
  ('14:30', '2:30 PM', 16),
  ('15:00', '3:00 PM', 17),
  ('15:30', '3:30 PM', 18),
  ('16:00', '4:00 PM', 19),
  ('16:30', '4:30 PM', 20),
  ('17:00', '5:00 PM', 21),
  ('17:30', '5:30 PM', 22),
  ('18:00', '6:00 PM', 23),
  ('18:30', '6:30 PM', 24),
  ('19:00', '7:00 PM', 25),
  ('19:30', '7:30 PM', 26),
  ('20:00', '8:00 PM', 27),
  ('20:30', '8:30 PM', 28),
  ('21:00', '9:00 PM', 29),
  ('21:30', '9:30 PM', 30)
ON CONFLICT (slot_time) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_booking_time_slots_active_order ON booking_time_slots(is_active, display_order);
