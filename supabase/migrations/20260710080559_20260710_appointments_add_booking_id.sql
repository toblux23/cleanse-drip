-- Link appointments back to the booking they were created from.
-- Nullable so existing appointments and manually-created ones are unaffected.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES client_bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_booking_id ON appointments(booking_id)
  WHERE booking_id IS NOT NULL;
