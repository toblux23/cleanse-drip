-- Adds all new intake form fields from the Client Intake Form PDF
-- New medical, lifestyle, and consent columns for client_bookings

ALTER TABLE public.client_bookings
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS weight text,
  ADD COLUMN IF NOT EXISTS is_pregnant_breastfeeding text,
  ADD COLUMN IF NOT EXISTS pre_existing_condition text,
  ADD COLUMN IF NOT EXISTS family_history text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS taking_medications text,
  ADD COLUMN IF NOT EXISTS has_allergies text,
  ADD COLUMN IF NOT EXISTS bleeding_disorders text,
  ADD COLUMN IF NOT EXISTS water_intake text,
  ADD COLUMN IF NOT EXISTS exercise_frequency text,
  ADD COLUMN IF NOT EXISTS alcohol_consumption text,
  ADD COLUMN IF NOT EXISTS smoking_vaping text,
  ADD COLUMN IF NOT EXISTS consent_given boolean DEFAULT false;
