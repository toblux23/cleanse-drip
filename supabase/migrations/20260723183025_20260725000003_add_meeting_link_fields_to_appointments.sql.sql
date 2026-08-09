/*
# Add meeting link fields to appointments

## Purpose
Scheduled consultations need to store virtual meeting details (platform, link,
notes) so booking staff can record where the doctor consultation will happen
and users with access can view the details.

## Changes
- Add `meeting_platform` (text, nullable)
- Add `meeting_link` (text, nullable)
- Add `meeting_notes` (text, nullable)

## Notes
- All nullable — existing appointments are unaffected.
- No new tables; reuses the existing appointments table.
- No workflow changes.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='meeting_platform') THEN
    ALTER TABLE appointments ADD COLUMN meeting_platform text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='meeting_link') THEN
    ALTER TABLE appointments ADD COLUMN meeting_link text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='meeting_notes') THEN
    ALTER TABLE appointments ADD COLUMN meeting_notes text;
  END IF;
END $$;
