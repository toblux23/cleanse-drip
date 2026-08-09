-- Allow anon (unauthenticated) clients to submit consent/waiver forms via QR link.
-- Mirrors the existing anon_insert_client_feedback policy. Scoped to records tied to a real appointment.
CREATE POLICY "anon_insert_consent_records"
  ON client_consent_records
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (appointment_id IS NOT NULL);
