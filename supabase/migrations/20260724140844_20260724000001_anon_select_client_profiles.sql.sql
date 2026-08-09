/*
# Add anon SELECT policy on client_profiles

## Context
The public Intake Form (BookingForm.tsx) creates a client_profiles row via
Supabase .upsert(), which internally appends RETURNING to the SQL statement.
PostgreSQL requires a SELECT policy to allow RETURNING on an RLS-enabled table.
The existing SELECT policy (team_select_client_profiles) is authenticated-only,
so the anon role gets error 42501 during the upsert.

## Change
- Add `anon_select_client_profiles` — mirrors the existing
  `anon_select_clients` policy on the clients table.
- No authenticated policies are modified.
- No INSERT/UPDATE/DELETE policies are modified.
- The clients table is not touched.
*/

DROP POLICY IF EXISTS "anon_select_client_profiles" ON client_profiles;
CREATE POLICY "anon_select_client_profiles"
  ON client_profiles FOR SELECT
  TO anon, authenticated
  USING (true);
