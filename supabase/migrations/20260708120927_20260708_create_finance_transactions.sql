/*
# Create finance_transactions table

## Summary
Adds a shared team finance ledger so all approved team members can track
company income and expenses from the Team Dashboard.

## New Tables

### finance_transactions
Stores each money-in or money-out event with the following columns:
- `id`          — UUID primary key, auto-generated.
- `type`        — Either 'income' or 'expense'. Constrained by CHECK.
- `amount`      — Positive decimal (up to 12 digits, 2 decimal places). Must be > 0.
- `category`    — Free-text category label (e.g. "Service Revenue", "Supplies").
- `description` — Optional free-text note describing the transaction.
- `date`        — Calendar date of the transaction (not the insert time).
- `reference`   — Optional reference code / receipt number.
- `created_by`  — UUID of the authenticated user who recorded the transaction.
- `created_at`  — Timestamp of when the row was inserted.

## Security

RLS is enabled. All four CRUD policies target the `authenticated` role with
`USING (true)` / `WITH CHECK (true)` because finance data is intentionally
shared across the entire team — every approved team member can read and manage
all transactions. Access is gated at the application layer (sign-in required).

## Notes
1. `amount` has a CHECK constraint (> 0) — the sign of a transaction is conveyed
   by the `type` column, not a negative amount.
2. `date` is a DATE (not timestamptz) so fiscal grouping by day / month is
   straightforward without timezone conversion.
3. An index on `(date DESC)` supports the default sort order efficiently.
4. An index on `type` supports quick income-vs-expense aggregations.
*/

CREATE TABLE IF NOT EXISTS finance_transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('income', 'expense')),
  amount      numeric(12, 2) NOT NULL CHECK (amount > 0),
  category    text NOT NULL,
  description text,
  date        date NOT NULL DEFAULT CURRENT_DATE,
  reference   text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_transactions_date_idx ON finance_transactions (date DESC);
CREATE INDEX IF NOT EXISTS finance_transactions_type_idx ON finance_transactions (type);

ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_select_finance" ON finance_transactions;
CREATE POLICY "team_select_finance" ON finance_transactions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "team_insert_finance" ON finance_transactions;
CREATE POLICY "team_insert_finance" ON finance_transactions
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "team_update_finance" ON finance_transactions;
CREATE POLICY "team_update_finance" ON finance_transactions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "team_delete_finance" ON finance_transactions;
CREATE POLICY "team_delete_finance" ON finance_transactions
  FOR DELETE TO authenticated USING (true);
