/*
# Add consultation_request_id to appointments

## Purpose
Confirmed consultation requests need to be scheduled as appointments.
The appointments table already has a `booking_id` FK for linking to client_bookings.
This adds an equivalent `consultation_request_id` FK to link appointments
back to the consultation request that originated them.

## Changes
- Add column `consultation_request_id` (uuid, nullable) to `appointments`
- Add FK constraint referencing `consultation_requests(id)` with ON DELETE SET NULL

## Notes
- Nullable: existing appointments are unaffected.
- No data is modified or lost.
- No new tables created — reuses the existing appointments table.
- Booking workflow is not modified — `booking_id` remains untouched.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'consultation_request_id'
  ) THEN
    ALTER TABLE appointments ADD COLUMN consultation_request_id uuid;
    ALTER TABLE appointments ADD CONSTRAINT appointments_consultation_request_id_fkey
      FOREIGN KEY (consultation_request_id) REFERENCES consultation_requests(id) ON DELETE SET NULL;
  END IF;
END $$;
