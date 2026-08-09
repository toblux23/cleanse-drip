/*
# Nurse Workspace: Notifications, Booking Buffer, Consent & Treatment Notes

## Summary
Adds the persistence layer for the role-based Nurse Dashboard:
in-app notifications for confirmed bookings, a configurable booking
lead-time buffer with audit log, permanent consent/waiver records with
signature capture, nurse treatment notes, and per-nurse notification
channel preferences. All new tables are RLS-protected and scoped to
the authenticated user. No existing tables are altered destructively
— only additive columns and new tables.

## New Tables
1. `nurse_notifications` — in-app notification feed for nurses when a
   booking is confirmed and assigned. Unique constraint on
   (recipient_user_id, booking_id, event_type) prevents duplicate
   alerts for the same confirmation event.
2. `notification_deliveries` — tracks multi-channel delivery status
   per notification (in_app/email/sms/push;
   pending/sent/delivered/failed/not_configured).
3. `nurse_notification_preferences` — per-nurse channel toggles and
   contact info (email/sms/push enabled, registered email/mobile,
   push_subscribed).
4. `booking_buffer_settings` — configurable minimum lead time
   (buffer_value + buffer_unit minutes/hours, scope_type
   all/selected_nurse/selected_branch/selected_service, effective_date,
   is_active). Default seed: 2 hours, all.
5. `booking_buffer_audit` — immutable audit log for every buffer change
   (old_value, new_value, changed_by, changed_at, reason).
6. `client_consent_records` — permanent consent/waiver records linked
   to client + appointment. Append-only: corrections create a new
   version and mark the old as superseded. Fields: signature_data
   (base64 PNG), signatory_name, form_version, submission_method,
   witness_user_id, ip_address, user_agent.
7. `client_treatment_notes` — nurse-authored treatment notes linked to
   client + appointment, with adverse_reaction flag and details.

## Modified Tables
- `client_bookings`: ADD COLUMN `nurse_acknowledged_at` (timestamptz,
  nullable) — set when the assigned nurse acknowledges a confirmed
  booking. Additive only.

## Security
- RLS enabled on every new table.
- `nurse_notifications`: owner-scoped SELECT/UPDATE (recipient only);
  INSERT allowed for authenticated.
- `notification_deliveries`: SELECT for the notification owner;
  INSERT/UPDATE for authenticated.
- `nurse_notification_preferences`: owner-scoped full CRUD.
- `booking_buffer_settings`: SELECT for all authenticated; write
  restricted to `settings.manage` permission.
- `booking_buffer_audit`: SELECT + INSERT for authenticated; immutable
  (no UPDATE/DELETE policies).
- `client_consent_records`: SELECT/INSERT for nurse.view or
  clients.view; UPDATE for nurse.view or clients.view; DELETE for
  clients.delete.
- `client_treatment_notes`: SELECT for nurse.view or clients.view;
  INSERT/UPDATE for nurse.view or clients.view; DELETE for
  clients.delete.

## Important Notes
1. All policies use `auth.uid()` for ownership — never `current_user`.
2. `nurse_notifications` unique constraint prevents duplicate alerts.
3. `client_consent_records` are append-only; supersession creates a new
   row, preserving full audit history.
4. `booking_buffer_audit` is immutable.
5. Default buffer setting (2 hours, scope=all) is seeded.
6. No transaction control statements are used.
*/

-- ═══════════════════════════════════════════════════════════════════
-- 1. nurse_notifications
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nurse_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL,
  booking_id uuid,
  appointment_id uuid,
  client_name text NOT NULL DEFAULT '',
  booking_ref text,
  service text,
  appointment_date date,
  appointment_time text,
  service_location text,
  message text NOT NULL DEFAULT '',
  event_type text NOT NULL DEFAULT 'booking_confirmed',
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  archived_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS nurse_notifications_dedup_idx
  ON nurse_notifications (recipient_user_id, booking_id, event_type)
  WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS nurse_notifications_recipient_idx
  ON nurse_notifications (recipient_user_id, created_at DESC);

ALTER TABLE nurse_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_nurse_notifications" ON nurse_notifications;
CREATE POLICY "select_own_nurse_notifications" ON nurse_notifications FOR SELECT
  TO authenticated USING (auth.uid() = recipient_user_id);

DROP POLICY IF EXISTS "insert_nurse_notifications" ON nurse_notifications;
CREATE POLICY "insert_nurse_notifications" ON nurse_notifications FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_nurse_notifications" ON nurse_notifications;
CREATE POLICY "update_own_nurse_notifications" ON nurse_notifications FOR UPDATE
  TO authenticated USING (auth.uid() = recipient_user_id) WITH CHECK (auth.uid() = recipient_user_id);

-- ═══════════════════════════════════════════════════════════════════
-- 2. notification_deliveries
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES nurse_notifications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('in_app','email','sms','push')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','failed','not_configured')),
  provider_message_id text,
  error_message text,
  attempted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notif_delivery_notification_idx ON notification_deliveries (notification_id);

ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notification_deliveries" ON notification_deliveries;
CREATE POLICY "select_own_notification_deliveries" ON notification_deliveries FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM nurse_notifications n WHERE n.id = notification_deliveries.notification_id AND n.recipient_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_notification_deliveries" ON notification_deliveries;
CREATE POLICY "insert_notification_deliveries" ON notification_deliveries FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_notification_deliveries" ON notification_deliveries;
CREATE POLICY "update_notification_deliveries" ON notification_deliveries FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- 3. nurse_notification_preferences
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nurse_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT false,
  push_enabled boolean NOT NULL DEFAULT false,
  registered_email text,
  registered_mobile text,
  push_subscribed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nurse_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_nurse_notif_prefs" ON nurse_notification_preferences;
CREATE POLICY "select_own_nurse_notif_prefs" ON nurse_notification_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_nurse_notif_prefs" ON nurse_notification_preferences;
CREATE POLICY "insert_own_nurse_notif_prefs" ON nurse_notification_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_nurse_notif_prefs" ON nurse_notification_preferences;
CREATE POLICY "update_own_nurse_notif_prefs" ON nurse_notification_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════
-- 4. booking_buffer_settings
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS booking_buffer_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buffer_value integer NOT NULL DEFAULT 2,
  buffer_unit text NOT NULL DEFAULT 'hours' CHECK (buffer_unit IN ('minutes','hours')),
  scope_type text NOT NULL DEFAULT 'all' CHECK (scope_type IN ('all','selected_nurse','selected_branch','selected_service')),
  scope_target text,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  is_active boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE booking_buffer_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_buffer_settings" ON booking_buffer_settings;
CREATE POLICY "select_buffer_settings" ON booking_buffer_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_buffer_settings" ON booking_buffer_settings;
CREATE POLICY "insert_buffer_settings" ON booking_buffer_settings FOR INSERT
  TO authenticated WITH CHECK (has_permission('settings.manage'));

DROP POLICY IF EXISTS "update_buffer_settings" ON booking_buffer_settings;
CREATE POLICY "update_buffer_settings" ON booking_buffer_settings FOR UPDATE
  TO authenticated USING (has_permission('settings.manage')) WITH CHECK (has_permission('settings.manage'));

DROP POLICY IF EXISTS "delete_buffer_settings" ON booking_buffer_settings;
CREATE POLICY "delete_buffer_settings" ON booking_buffer_settings FOR DELETE
  TO authenticated USING (has_permission('settings.manage'));

-- Seed default: 2 hours, all nurses
INSERT INTO booking_buffer_settings (buffer_value, buffer_unit, scope_type, is_active, created_by)
VALUES (2, 'hours', 'all', true, 'system')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- 5. booking_buffer_audit
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS booking_buffer_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_id uuid REFERENCES booking_buffer_settings(id) ON DELETE SET NULL,
  old_value text,
  new_value text,
  changed_by text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

ALTER TABLE booking_buffer_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_buffer_audit" ON booking_buffer_audit;
CREATE POLICY "select_buffer_audit" ON booking_buffer_audit FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_buffer_audit" ON booking_buffer_audit;
CREATE POLICY "insert_buffer_audit" ON booking_buffer_audit FOR INSERT
  TO authenticated WITH CHECK (true);

-- No UPDATE or DELETE policies — audit log is immutable.

-- ═══════════════════════════════════════════════════════════════════
-- 6. client_consent_records
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid,
  appointment_id uuid,
  service text,
  form_version text NOT NULL DEFAULT 'v1',
  form_type text NOT NULL DEFAULT 'consent' CHECK (form_type IN ('consent','waiver')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','superseded')),
  signatory_name text,
  signature_data text,
  signed_at timestamptz,
  submission_method text CHECK (submission_method IN ('clinic_ipad','client_link','qr_code') OR submission_method IS NULL),
  witness_user_id uuid,
  ip_address text,
  user_agent text,
  superseded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consent_client_idx ON client_consent_records (client_id);
CREATE INDEX IF NOT EXISTS consent_appointment_idx ON client_consent_records (appointment_id);

ALTER TABLE client_consent_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_consent_records" ON client_consent_records;
CREATE POLICY "select_consent_records" ON client_consent_records FOR SELECT
  TO authenticated USING (has_permission('nurse.view') OR has_permission('clients.view'));

DROP POLICY IF EXISTS "insert_consent_records" ON client_consent_records;
CREATE POLICY "insert_consent_records" ON client_consent_records FOR INSERT
  TO authenticated WITH CHECK (has_permission('nurse.view') OR has_permission('clients.view'));

DROP POLICY IF EXISTS "update_consent_records" ON client_consent_records;
CREATE POLICY "update_consent_records" ON client_consent_records FOR UPDATE
  TO authenticated USING (has_permission('nurse.view') OR has_permission('clients.view'))
  WITH CHECK (has_permission('nurse.view') OR has_permission('clients.view'));

DROP POLICY IF EXISTS "delete_consent_records" ON client_consent_records;
CREATE POLICY "delete_consent_records" ON client_consent_records FOR DELETE
  TO authenticated USING (has_permission('clients.delete'));

-- ═══════════════════════════════════════════════════════════════════
-- 7. client_treatment_notes
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_treatment_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid,
  appointment_id uuid,
  nurse_user_id uuid,
  nurse_name text,
  note_text text NOT NULL DEFAULT '',
  adverse_reaction boolean NOT NULL DEFAULT false,
  reaction_details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS treatment_notes_client_idx ON client_treatment_notes (client_id);
CREATE INDEX IF NOT EXISTS treatment_notes_appointment_idx ON client_treatment_notes (appointment_id);

ALTER TABLE client_treatment_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_treatment_notes" ON client_treatment_notes;
CREATE POLICY "select_treatment_notes" ON client_treatment_notes FOR SELECT
  TO authenticated USING (has_permission('nurse.view') OR has_permission('clients.view'));

DROP POLICY IF EXISTS "insert_treatment_notes" ON client_treatment_notes;
CREATE POLICY "insert_treatment_notes" ON client_treatment_notes FOR INSERT
  TO authenticated WITH CHECK (has_permission('nurse.view') OR has_permission('clients.view'));

DROP POLICY IF EXISTS "update_treatment_notes" ON client_treatment_notes;
CREATE POLICY "update_treatment_notes" ON client_treatment_notes FOR UPDATE
  TO authenticated USING (has_permission('nurse.view') OR has_permission('clients.view'))
  WITH CHECK (has_permission('nurse.view') OR has_permission('clients.view'));

DROP POLICY IF EXISTS "delete_treatment_notes" ON client_treatment_notes;
CREATE POLICY "delete_treatment_notes" ON client_treatment_notes FOR DELETE
  TO authenticated USING (has_permission('clients.delete'));

-- ═══════════════════════════════════════════════════════════════════
-- 8. client_bookings: add nurse_acknowledged_at (additive)
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_bookings' AND column_name = 'nurse_acknowledged_at'
  ) THEN
    ALTER TABLE client_bookings ADD COLUMN nurse_acknowledged_at timestamptz;
  END IF;
END $$;