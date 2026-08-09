/*
# Internal Doctor Recommendation Records

## Purpose
After a virtual doctor consultation, the doctor provides a recommendation.
Booking Staff records this recommendation internally for client continuity.
The record is linked to both the consultation appointment and the client.

## New Table: consultation_recommendations
- `id` (uuid, primary key)
- `appointment_id` (uuid, FK to appointments, nullable) — links to the consultation appointment
- `consultation_request_id` (uuid, FK to consultation_requests, nullable) — links to the consultation request
- `client_id` (uuid, FK to clients, nullable) — links to the client record
- `recommendation_text` (text, not null) — the doctor's recommendation notes
- `recorded_by_email` (text, nullable) — email of the booking staff who recorded it
- `recorded_at` (timestamptz, default now()) — when the recommendation was recorded
- `created_at` (timestamptz, default now())

## Security
- RLS enabled on `consultation_recommendations`.
- Only approved team members can SELECT, INSERT, UPDATE.
- No DELETE policy — recommendations are immutable once recorded (audit trail).
- No anon access — this is internal-only data, never shown to clients.

## Notes
- Reuses existing `appointments`, `consultation_requests`, and `clients` tables — no schema changes to them.
- The `consultations.recommend` permission already exists in the RBAC system and is granted to `booking_staff` and `superadmin` roles.
- Does not modify booking workflow, intake forms, or nurse workflows.
*/

CREATE TABLE IF NOT EXISTS consultation_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  consultation_request_id uuid REFERENCES consultation_requests(id) ON DELETE SET NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  recommendation_text text NOT NULL,
  recorded_by_email text,
  recorded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE consultation_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_consultation_recommendations" ON consultation_recommendations;
CREATE POLICY "select_consultation_recommendations"
ON consultation_recommendations FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid()
    AND team_members.status = 'approved'
  )
);

DROP POLICY IF EXISTS "insert_consultation_recommendations" ON consultation_recommendations;
CREATE POLICY "insert_consultation_recommendations"
ON consultation_recommendations FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid()
    AND team_members.status = 'approved'
  )
);

DROP POLICY IF EXISTS "update_consultation_recommendations" ON consultation_recommendations;
CREATE POLICY "update_consultation_recommendations"
ON consultation_recommendations FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid()
    AND team_members.status = 'approved'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = auth.uid()
    AND team_members.status = 'approved'
  )
);

CREATE INDEX IF NOT EXISTS idx_consultation_recommendations_appointment_id ON consultation_recommendations(appointment_id);
CREATE INDEX IF NOT EXISTS idx_consultation_recommendations_client_id ON consultation_recommendations(client_id);
CREATE INDEX IF NOT EXISTS idx_consultation_recommendations_consultation_request_id ON consultation_recommendations(consultation_request_id);
