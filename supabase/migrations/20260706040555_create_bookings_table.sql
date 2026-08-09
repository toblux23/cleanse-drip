/*
# Create client_bookings table

## Summary
Creates the core table for the Client Bookings (Internal) intake management system.
This is a single-tenant, no-auth app — all team members and clients access data via the anon key.

## New Tables

### `client_bookings`
Stores all client booking/inquiry submissions from the intake form.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key, auto-generated |
| full_name | text | Client's full name (required) |
| preferred_date | date | Preferred appointment date (required) |
| preferred_time | time | Preferred appointment time (required) |
| intake_form_status | text | 'COMPLETED' or 'PENDING' (required) |
| services_requested | text[] | Array of selected services (required) |
| status | text | Booking status: 'NEW', 'CONFIRMED', 'CANCELLED' — defaults to 'NEW' |
| notes | text | Optional internal team notes |
| created_at | timestamptz | Submission timestamp |

## Security
- RLS enabled on `client_bookings`.
- Policies scoped to `anon, authenticated` since this is a no-auth internal tool.
- All CRUD allowed for anon+authenticated (intentional — internal team tool).
*/

CREATE TABLE IF NOT EXISTS client_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  preferred_date date NOT NULL,
  preferred_time time NOT NULL,
  intake_form_status text NOT NULL CHECK (intake_form_status IN ('COMPLETED', 'PENDING')),
  services_requested text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONFIRMED', 'CANCELLED')),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_bookings_created_at_idx ON client_bookings (created_at DESC);
CREATE INDEX IF NOT EXISTS client_bookings_status_idx ON client_bookings (status);

ALTER TABLE client_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_client_bookings" ON client_bookings;
CREATE POLICY "anon_select_client_bookings" ON client_bookings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_client_bookings" ON client_bookings;
CREATE POLICY "anon_insert_client_bookings" ON client_bookings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_client_bookings" ON client_bookings;
CREATE POLICY "anon_update_client_bookings" ON client_bookings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_client_bookings" ON client_bookings;
CREATE POLICY "anon_delete_client_bookings" ON client_bookings FOR DELETE
  TO anon, authenticated USING (true);
