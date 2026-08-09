-- Add appointment_id to client_feedback so email-sourced submissions link back to the appointment
ALTER TABLE client_feedback
  ADD COLUMN appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_feedback_appointment_id
  ON client_feedback(appointment_id);

-- Track when a feedback-request email was sent for each appointment (dedup guard)
ALTER TABLE appointments
  ADD COLUMN feedback_email_sent_at timestamptz;
