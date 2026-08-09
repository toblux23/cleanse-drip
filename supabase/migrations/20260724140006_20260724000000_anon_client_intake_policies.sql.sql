/*
# Allow public Intake Form to create and look up clients

## Context
The public Intake Form (BookingForm.tsx) runs as the anon role — it has no
sign-in. The client_bookings table already has anon INSERT/SELECT policies,
which is why the old intake flow (booking-only) worked. The recent change that
also creates a `clients` + `client_profiles` record fails because those tables
only have `authenticated` policies. This adds the minimum anon policies needed.

## Changes
1. `clients` table
   - anon SELECT: allows duplicate lookup by email/phone before insert
   - anon INSERT: allows the public intake form to create a client record
2. `client_profiles` table
   - anon INSERT: allows the public intake form to create the profile record
     (used via upsert with onConflict: 'client_id'; for a brand-new client the
     row does not exist yet so only the INSERT path fires)

## Security notes
- anon UPDATE and DELETE are intentionally NOT added — only authenticated
  team members can modify or delete client records.
- The existing authenticated-only policies remain unchanged.
- This mirrors the existing anon policy pattern on client_bookings.
*/

-- ── clients: anon SELECT (duplicate lookup) ──────────────────────────────────
DROP POLICY IF EXISTS "anon_select_clients" ON clients;
CREATE POLICY "anon_select_clients"
  ON clients FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── clients: anon INSERT (intake form creates client) ─────────────────────────
DROP POLICY IF EXISTS "anon_insert_clients" ON clients;
CREATE POLICY "anon_insert_clients"
  ON clients FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ── client_profiles: anon INSERT (intake form creates profile) ───────────────
DROP POLICY IF EXISTS "anon_insert_client_profiles" ON client_profiles;
CREATE POLICY "anon_insert_client_profiles"
  ON client_profiles FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
