/*
# Phase 2 — Billing & Accounts Receivable: packages, orders, payments

## Summary
Creates three tables that power the Billing / AR module. Service packages
are catalogued in `packages`. Each billable event generates an `orders` row
that moves through an unpaid → partial → paid lifecycle. Individual cash
receipts are tracked in `payments`, which cascade-delete when their parent
order is removed.

## New Tables

### packages
Catalogue of sellable service packages. Optional branch association for
branch-specific pricing.
- `id`                uuid PK
- `name`              text NOT NULL
- `description`       text nullable
- `price`             numeric(12,2) NOT NULL DEFAULT 0
- `sessions_included` int NOT NULL DEFAULT 1
- `branch_id`         uuid nullable FK → branches.id (null = all branches)
- `is_active`         boolean DEFAULT true
- `created_at`        timestamptz

### orders
One row per billable event. Linked to a client and optionally to a package
and/or an appointment. Status tracks the payment lifecycle.
- `id`             uuid PK
- `client_id`      uuid NOT NULL FK → clients.id
- `package_id`     uuid nullable FK → packages.id
- `appointment_id` uuid nullable FK → appointments.id
- `description`    text nullable — free-text line item description
- `total_amount`   numeric(12,2) NOT NULL DEFAULT 0
- `status`         text DEFAULT 'unpaid' CHECK IN (unpaid, partial, paid, void)
- `created_at`     timestamptz
- `created_by`     uuid nullable — auth.uid() of the team member who created it

### payments
Individual payment receipts against an order. Deletes cascade when the
parent order is deleted.
- `id`           uuid PK
- `order_id`     uuid NOT NULL FK → orders.id ON DELETE CASCADE
- `client_id`    uuid NOT NULL FK → clients.id
- `amount`       numeric(12,2) NOT NULL
- `method`       text DEFAULT 'cash' CHECK IN (cash, gcash, bank, card, other)
- `reference`    text nullable — GCash ref, bank ref, etc.
- `paid_at`      timestamptz DEFAULT now()
- `recorded_by`  uuid nullable — auth.uid() of the recording team member

## Indexes
- orders(client_id)   — per-client AR queries
- orders(status)      — status filtering
- payments(order_id)  — payment lookup per order
- payments(client_id) — payment history per client

## Security
Mirrors the tightened finance_transactions / operations tables RLS pattern:
- SELECT: all authenticated users
- INSERT: all authenticated users (app layer gates by approved membership)
- UPDATE: approved team members only (team_members.status = 'approved')
- DELETE: superadmin-approved members only (role = 'superadmin' AND status = 'approved')
*/

-- ── 1. packages ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS packages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  description       text,
  price             numeric(12,2) NOT NULL DEFAULT 0,
  sessions_included int NOT NULL DEFAULT 1,
  branch_id         uuid REFERENCES branches(id) ON DELETE SET NULL,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS packages_branch_id_idx ON packages (branch_id);

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_select_packages"       ON packages;
DROP POLICY IF EXISTS "team_insert_packages"       ON packages;
DROP POLICY IF EXISTS "team_update_packages"       ON packages;
DROP POLICY IF EXISTS "superadmin_delete_packages" ON packages;

CREATE POLICY "team_select_packages" ON packages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "team_insert_packages" ON packages
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "team_update_packages" ON packages
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'
  ));

CREATE POLICY "superadmin_delete_packages" ON packages
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid()
      AND team_members.role = 'superadmin'
      AND team_members.status = 'approved'
  ));

-- ── 2. orders ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  package_id     uuid REFERENCES packages(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  description    text,
  total_amount   numeric(12,2) NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'unpaid'
                 CONSTRAINT orders_status_check
                   CHECK (status IN ('unpaid','partial','paid','void')),
  created_at     timestamptz DEFAULT now(),
  created_by     uuid
);

CREATE INDEX IF NOT EXISTS orders_client_id_idx ON orders (client_id);
CREATE INDEX IF NOT EXISTS orders_status_idx    ON orders (status);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_select_orders"       ON orders;
DROP POLICY IF EXISTS "team_insert_orders"       ON orders;
DROP POLICY IF EXISTS "team_update_orders"       ON orders;
DROP POLICY IF EXISTS "superadmin_delete_orders" ON orders;

CREATE POLICY "team_select_orders" ON orders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "team_insert_orders" ON orders
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "team_update_orders" ON orders
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'
  ));

CREATE POLICY "superadmin_delete_orders" ON orders
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid()
      AND team_members.role = 'superadmin'
      AND team_members.status = 'approved'
  ));

-- ── 3. payments ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  amount      numeric(12,2) NOT NULL,
  method      text NOT NULL DEFAULT 'cash'
              CONSTRAINT payments_method_check
                CHECK (method IN ('cash','gcash','bank','card','other')),
  reference   text,
  paid_at     timestamptz DEFAULT now(),
  recorded_by uuid
);

CREATE INDEX IF NOT EXISTS payments_order_id_idx   ON payments (order_id);
CREATE INDEX IF NOT EXISTS payments_client_id_idx  ON payments (client_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_select_payments"       ON payments;
DROP POLICY IF EXISTS "team_insert_payments"       ON payments;
DROP POLICY IF EXISTS "team_update_payments"       ON payments;
DROP POLICY IF EXISTS "superadmin_delete_payments" ON payments;

CREATE POLICY "team_select_payments" ON payments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "team_insert_payments" ON payments
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "team_update_payments" ON payments
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'
  ));

CREATE POLICY "superadmin_delete_payments" ON payments
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid()
      AND team_members.role = 'superadmin'
      AND team_members.status = 'approved'
  ));
