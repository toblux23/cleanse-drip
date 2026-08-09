/*
# Link client_bookings to clients table

## Purpose
Currently, `client_bookings` stores client information inline (full_name, email, etc.)
but has no foreign key to the `clients` table. This makes it impossible to distinguish
whether a booking was created for an existing client (who already has a profile in the
`clients` + `client_profiles` tables) or a new walk-in client.

## Changes
1. Add `client_id` column (nullable uuid) to `client_bookings`.
2. Add a foreign key constraint referencing `clients(id)` with `ON DELETE SET NULL`.
3. Add an index on `client_id` for faster lookups.

## Security
- No RLS policy changes. The existing RLS policies on `client_bookings` already
  govern access. The new column is nullable so existing rows are unaffected.

## Notes
- The column is nullable so existing bookings (which have no client link) remain valid.
- When booking staff select an existing client, the booking will store `client_id`.
- When booking staff create a new client, the new client's ID will be stored.
- `ON DELETE SET NULL` ensures deleting a client doesn't cascade-delete bookings.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_bookings' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE client_bookings ADD COLUMN client_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_bookings_client_id_fkey'
  ) THEN
    ALTER TABLE client_bookings
      ADD CONSTRAINT client_bookings_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_bookings_client_id ON client_bookings(client_id) WHERE client_id IS NOT NULL;
