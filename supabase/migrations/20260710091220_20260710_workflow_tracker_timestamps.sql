-- Add confirmed_at to client_bookings to track when a booking was confirmed
ALTER TABLE client_bookings
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- Add payment_recorded_at to appointments to track when payment was first recorded
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_recorded_at timestamptz;
