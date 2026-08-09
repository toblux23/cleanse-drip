/*
# Add assigned_nurse_id to client_bookings

## Summary
Adds a nullable `assigned_nurse_id` column to `client_bookings` so that a nurse
can be assigned at the time of manual booking entry. This links the booking to
a specific team member who will handle the appointment.

## Modified Tables

### client_bookings
- `assigned_nurse_id` (uuid, nullable, FK → team_members.user_id ON DELETE SET NULL)
  Nullable so existing bookings and public intake form submissions are unaffected.
  When set, the nurse dashboard can filter appointments by their assignment.

## Security
- No RLS policy changes needed. The column is writable by authenticated users
  (existing INSERT/UPDATE policies cover it) and readable by all (existing SELECT).

## Important Notes
1. Column is nullable — existing rows and public form submissions are unaffected.
2. FK references team_members.user_id (not id) since the app identifies staff by user_id.
*/

ALTER TABLE client_bookings
  ADD COLUMN IF NOT EXISTS assigned_nurse_id uuid REFERENCES team_members(user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS client_bookings_assigned_nurse_id_idx ON client_bookings (assigned_nurse_id);
