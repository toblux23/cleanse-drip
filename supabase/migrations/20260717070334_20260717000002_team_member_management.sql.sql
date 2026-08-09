/*
# Team Member Management — Add, Edit, Delete

1. Schema Changes
- Add `full_name` (text, nullable) to `team_members` so administrators can record
  the member's display name alongside the auth email.
- Add three new permissions: `team.add`, `team.edit`, `team.delete`.
- Grant all three new permissions to the `superadmin` role so existing superadmins
  retain full team-management capability.

2. New Server Functions
- `update_member_profile(member_user_id, new_full_name, new_role_key, new_branch_id)`
  SECURITY DEFINER RPC that lets an authorized admin update a member's display
  name, role, and branch in a single call. Reuses the existing `has_permission`
  helper and enforces the same "cannot change own role" guard as
  `change_member_role`.

3. Security
- All new functions are SECURITY DEFINER with `search_path = 'public'`.
- `update_member_profile` requires `team.edit` permission and prevents a user
  from changing their own role (consistent with `change_member_role`).
- No RLS policy changes — existing team_members RLS remains unchanged.

4. Important Notes
- `full_name` is nullable so existing rows are not affected.
- The `handle_new_user` trigger is NOT modified — it continues to create rows
  with pending/staff defaults. The invite edge function updates the row after
  the trigger fires.
- No destructive operations; purely additive.
*/

-- 1. Add full_name column to team_members
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS full_name text;

-- 2. Add granular team permissions
INSERT INTO permissions (key, label, description)
VALUES
  ('team.add', 'Add Team Members', 'Invite new team members and create their accounts'),
  ('team.edit', 'Edit Team Members', 'Update member profile, role, and branch'),
  ('team.delete', 'Delete Team Members', 'Permanently remove member accounts and auth users')
ON CONFLICT (key) DO NOTHING;

-- 3. Grant new permissions to superadmin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'superadmin'
  AND p.key IN ('team.add', 'team.edit', 'team.delete')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. update_member_profile RPC
CREATE OR REPLACE FUNCTION public.update_member_profile(
  member_user_id uuid,
  new_full_name text DEFAULT NULL,
  new_role_key text DEFAULT NULL,
  new_branch_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_permission('team.edit') THEN
    RAISE EXCEPTION 'Permission denied: team.edit required';
  END IF;

  IF new_role_key IS NOT NULL AND member_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;

  IF new_role_key IS NOT NULL AND NOT EXISTS (SELECT 1 FROM roles WHERE key = new_role_key) THEN
    RAISE EXCEPTION 'Invalid role key: %', new_role_key;
  END IF;

  UPDATE team_members
  SET
    full_name = COALESCE(new_full_name, full_name),
    role = COALESCE(new_role_key, role),
    branch_id = COALESCE(new_branch_id, branch_id)
  WHERE user_id = member_user_id;
END;
$function$;
