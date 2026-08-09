-- Add appointment_id to payments so auto-generated rows can be targeted for upsert/delete
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payments_appointment_id_idx ON payments (appointment_id);

-- Add appointment_id to finance_transactions for the same reason
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS finance_transactions_appointment_id_idx ON finance_transactions (appointment_id);

-- Allow approved team members to delete auto-generated payment rows
-- (rows where appointment_id IS NOT NULL were created by RecordPaymentModal, not manually)
DROP POLICY IF EXISTS "team_delete_appt_payments" ON payments;
CREATE POLICY "team_delete_appt_payments" ON payments
  FOR DELETE TO authenticated
  USING (
    appointment_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'
    )
  );

-- Allow approved team members to delete auto-generated finance transactions
DROP POLICY IF EXISTS "team_delete_appt_finance_tx" ON finance_transactions;
CREATE POLICY "team_delete_appt_finance_tx" ON finance_transactions
  FOR DELETE TO authenticated
  USING (
    appointment_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'
    )
  );
