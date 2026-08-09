/*
# Tighten RLS — authenticated-only for UPDATE and DELETE

## Summary
Upgrades the security model for both `client_bookings` and `client_feedback` tables.
INSERT and SELECT remain open to anonymous users so the public booking and feedback forms
continue to work. UPDATE and DELETE are now restricted to authenticated team members only,
preventing unauthorized modification or deletion of client records via the API.

## Security Changes

### client_bookings
- DROP anon UPDATE policy → recreated as authenticated-only
- DROP anon DELETE policy → recreated as authenticated-only

### client_feedback
- DROP anon UPDATE policy → recreated as authenticated-only
- DROP anon DELETE policy → recreated as authenticated-only

## Important Notes
1. Anonymous clients can still INSERT new bookings and feedback (required for public forms).
2. SELECT remains open to anon + authenticated (no data is sensitive at read level for this tool).
3. Only logged-in team members can change booking status, add notes, or delete any record.
*/

-- client_bookings
DROP POLICY IF EXISTS "anon_update_client_bookings" ON client_bookings;
CREATE POLICY "auth_update_client_bookings" ON client_bookings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_client_bookings" ON client_bookings;
CREATE POLICY "auth_delete_client_bookings" ON client_bookings FOR DELETE
  TO authenticated USING (true);

-- client_feedback
DROP POLICY IF EXISTS "anon_update_client_feedback" ON client_feedback;
CREATE POLICY "auth_update_client_feedback" ON client_feedback FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_client_feedback" ON client_feedback;
CREATE POLICY "auth_delete_client_feedback" ON client_feedback FOR DELETE
  TO authenticated USING (true);
