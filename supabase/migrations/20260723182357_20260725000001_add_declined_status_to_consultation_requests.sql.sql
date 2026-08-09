/*
# Add 'declined' status to consultation_requests

## Purpose
The consultation confirmation tracking feature requires a 'Declined' status
for when the doctor declines the consultation via Viber. The existing CHECK
constraint only allows pending/confirmed/scheduled/completed/cancelled.

## Changes
- Drop the existing CHECK constraint on `consultation_requests.status`
- Add a new CHECK constraint that includes 'declined'

## Notes
- No data is modified — only the constraint is replaced.
- 'cancelled' is kept for backward compatibility (existing requests may use it).
- 'declined' is the new status for doctor-declined consultations.
*/

ALTER TABLE consultation_requests DROP CONSTRAINT IF EXISTS consultation_requests_status_check;

ALTER TABLE consultation_requests ADD CONSTRAINT consultation_requests_status_check
  CHECK (status IN ('pending', 'confirmed', 'declined', 'scheduled', 'completed', 'cancelled'));
