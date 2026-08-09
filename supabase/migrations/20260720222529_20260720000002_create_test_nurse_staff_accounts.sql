/*
# Create test nurse and staff accounts

1. Purpose
- Create two auth.users (nurse + staff) with known passwords for dashboard testing.
- Create matching team_members rows (status='approved') so the app resolves their role.
- No permissions are changed; roles 'nurse' and 'staff' already exist with their existing role_permissions.

2. Credentials (for testing only)
- nurse.test@cleansedrip.ph  / NurseTest123!
- staff.test@cleansedrip.ph / StaffTest123!

3. Notes
- Uses pgcrypto crypt() with bf (bcrypt) for encrypted_password, matching Supabase auth expectations.
- Idempotent: re-running will not duplicate emails (unique constraint on auth.users.email).
*/

DO $$
DECLARE
  nurse_uid uuid;
  staff_uid uuid;
BEGIN
  -- Insert nurse auth user if not exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'nurse.test@cleansedrip.ph') THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_sso_user)
    VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'nurse.test@cleansedrip.ph',
      crypt('NurseTest123!', gen_salt('bf')),
      now(), now(), now(), null,
      '{"provider":"email","providers":["email"]}',
      '{}',
      false
    )
    RETURNING id INTO nurse_uid;
  ELSE
    SELECT id INTO nurse_uid FROM auth.users WHERE email = 'nurse.test@cleansedrip.ph';
  END IF;

  -- Insert staff auth user if not exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'staff.test@cleansedrip.ph') THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_sso_user)
    VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'staff.test@cleansedrip.ph',
      crypt('StaffTest123!', gen_salt('bf')),
      now(), now(), now(), null,
      '{"provider":"email","providers":["email"]}',
      '{}',
      false
    )
    RETURNING id INTO staff_uid;
  ELSE
    SELECT id INTO staff_uid FROM auth.users WHERE email = 'staff.test@cleansedrip.ph';
  END IF;

  -- team_members rows (approved) — link auth user to role
  INSERT INTO team_members (user_id, email, role, status, full_name)
  VALUES (nurse_uid, 'nurse.test@cleansedrip.ph', 'nurse', 'approved', 'Test Nurse')
  ON CONFLICT DO NOTHING;

  INSERT INTO team_members (user_id, email, role, status, full_name)
  VALUES (staff_uid, 'staff.test@cleansedrip.ph', 'staff', 'approved', 'Test Staff')
  ON CONFLICT DO NOTHING;
END $$;