/*
# Add branch_id and pax columns to client_bookings

## Summary
Adds two optional columns to `client_bookings` so the staff Manual Entry modal can record
the preferred branch and number of pax for a booking. These columns are nullable with
sensible defaults so existing rows and the public intake form (which doesn't set them)
are completely unaffected.

## Modified Tables

### client_bookings
- `branch_id` (uuid, nullable, FK → branches.id ON DELETE SET NULL) — preferred branch for the booking.
  Nullable because the public intake form doesn't collect it; existing rows stay null.
- `pax` (integer, nullable, default 1) — number of people for the booking.
  Nullable so existing rows aren't forced to a value; the manual entry form defaults to 1.

## Security
- No RLS policy changes. Existing INSERT/SELECT policies (anon+authenticated) and
  UPDATE/DELETE policies (authenticated only) already cover the new columns implicitly.

## Important Notes
1. Both columns are nullable — no existing inserts break.
2. An index on branch_id helps future branch-filtered queries.
*/

ALTER TABLE client_bookings
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pax integer DEFAULT 1;

CREATE INDEX IF NOT EXISTS client_bookings_branch_id_idx ON client_bookings (branch_id);
