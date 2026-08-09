/*
# Notification Settings

## Summary
Adds a per-team-member notification preferences table so superadmins can
control which team members receive which types of email notifications.

## New Tables

### notification_settings
Stores one row per approved team member. If no row exists for a member, the
edge function treats them as opted in to all notifications (safe default).

- id (uuid, PK)
- team_member_id (uuid, unique FK → team_members ON DELETE CASCADE)
- notify_booking (boolean, default true) — new booking submissions
- notify_intake_form (boolean, default true) — new client feedback / intake form
- updated_at (timestamptz, default now())

## Security
- RLS enabled.
- SELECT + UPDATE: approved authenticated team members can read/write all rows
  (superadmin manages settings for others via the Settings tab).
- INSERT: same — approved members.
- DELETE: approved superadmins only.
*/

CREATE TABLE IF NOT EXISTS notification_settings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id   uuid UNIQUE NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  notify_booking   boolean NOT NULL DEFAULT true,
  notify_intake_form boolean NOT NULL DEFAULT true,
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_settings_select" ON notification_settings;
DROP POLICY IF EXISTS "notif_settings_insert" ON notification_settings;
DROP POLICY IF EXISTS "notif_settings_update" ON notification_settings;
DROP POLICY IF EXISTS "notif_settings_delete" ON notification_settings;

CREATE POLICY "notif_settings_select" ON notification_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  );

CREATE POLICY "notif_settings_insert" ON notification_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  );

CREATE POLICY "notif_settings_update" ON notification_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
    )
  );

CREATE POLICY "notif_settings_delete" ON notification_settings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
        AND tm.role = 'superadmin'
    )
  );
