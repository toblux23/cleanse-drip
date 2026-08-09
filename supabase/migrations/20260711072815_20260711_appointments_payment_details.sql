ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_amount  numeric(10,2),
  ADD COLUMN IF NOT EXISTS payment_method  text,
  ADD COLUMN IF NOT EXISTS payment_reference text;
