/*
# Create consultation_requests table

## Purpose
After intake, booking staff can offer a doctor consultation to the client.
When the client agrees, the booking staff creates a consultation request.
This migration creates the table to store and track those requests.

## New Table
- `consultation_requests`
  - `id` (uuid, primary key)
  - `client_id` (uuid, FK → clients.id, NOT NULL) — links to the existing client record
  - `booking_id` (uuid, FK → client_bookings.id, nullable) — optional link to the booking that originated the request
  - `requested_by` (uuid, FK → auth.users.id, NOT NULL, DEFAULT auth.uid()) — the team member who created the request
  - `request_date` (date, NOT NULL, DEFAULT current_date) — date the request was created
  - `reason` (text, NOT NULL) — reason for the consultation
  - `preferred_date` (date, nullable) — client's preferred schedule date
  - `preferred_time` (time, nullable) — client's preferred schedule time
  - `status` (text, NOT NULL, DEFAULT 'pending', CHECK in pending/confirmed/scheduled/completed/cancelled)
  - `created_at` (timestamptz, DEFAULT now())
  - `updated_at` (timestamptz, nullable)

## Security (RLS)
- SELECT: `TO authenticated` — any approved team member can view consultation requests
- INSERT: `TO authenticated`, restricted to approved team members with consultations.create permission
  (checked via team_members join; the permission itself is enforced in the UI)
- UPDATE: `TO authenticated`, restricted to approved team members (for status changes later)
- DELETE: not granted (requests are never deleted, only status-changed)

## Notes
- No duplicate client records: `client_id` references the existing `clients` table.
- The booking workflow is not modified: `booking_id` is optional and nullable.
- The intake workflow is not modified: this table is written to only after intake is complete.
- Initial status is always 'pending'.
- No doctor confirmation, Viber, scheduling, Zoom, or recommendations in this migration —
  only request creation and status tracking.
*/

CREATE TABLE IF NOT EXISTS consultation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  booking_id uuid REFERENCES client_bookings(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_date date NOT NULL DEFAULT current_date,
  reason text NOT NULL,
  preferred_date date,
  preferred_time time,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'scheduled', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

ALTER TABLE consultation_requests ENABLE ROW LEVEL SECURITY;

-- Any authenticated team member can view consultation requests
DROP POLICY IF EXISTS "select_consultation_requests" ON consultation_requests;
CREATE POLICY "select_consultation_requests" ON consultation_requests FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved')
  );

-- Approved team members can create consultation requests
DROP POLICY IF EXISTS "insert_consultation_requests" ON consultation_requests;
CREATE POLICY "insert_consultation_requests" ON consultation_requests FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved')
  );

-- Approved team members can update consultation requests (e.g. status changes)
DROP POLICY IF EXISTS "update_consultation_requests" ON consultation_requests;
CREATE POLICY "update_consultation_requests" ON consultation_requests FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'))
  WITH CHECK (EXISTS (SELECT 1 FROM team_members WHERE team_members.user_id = auth.uid() AND team_members.status = 'approved'));

-- No DELETE policy — consultation requests are never deleted

CREATE INDEX IF NOT EXISTS idx_consultation_requests_client ON consultation_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_consultation_requests_status ON consultation_requests(status);
CREATE INDEX IF NOT EXISTS idx_consultation_requests_requested_by ON consultation_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_consultation_requests_created_at ON consultation_requests(created_at DESC);
