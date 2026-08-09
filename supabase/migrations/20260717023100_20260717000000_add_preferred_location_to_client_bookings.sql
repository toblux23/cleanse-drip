/*
# Add preferred_location text column to client_bookings

## Why
The Manual Entry modal needs to support custom (non-branch) preferred locations.
`branch_id` is a UUID FK to `branches` and cannot hold arbitrary text.
`address` is the client's street address — semantically different.

## Change
- Adds nullable `preferred_location` text column to `client_bookings`.
- When a branch is selected, `branch_id` is set and `preferred_location` is null.
- When a custom location is typed, `preferred_location` is set and `branch_id` is null.
- No data loss: existing rows simply have NULL for the new column.
*/

ALTER TABLE client_bookings
  ADD COLUMN IF NOT EXISTS preferred_location text;
