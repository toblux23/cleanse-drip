/*
# Fix RBAC: Add UPDATE policy on team_members + FK ON UPDATE CASCADE

## Summary
Fixes two issues from the RBAC migration:
1. Missing UPDATE RLS policy on `team_members` — direct client `.update()` calls
   (e.g. assignBranch) were silently denied by RLS.
2. FK `team_members.role → roles(key)` lacked `ON UPDATE CASCADE`, blocking role key renames.

## RLS Changes
- Adds `team_update_own_branch` UPDATE policy on `team_members`: allows approved
  users with `team.manage` permission to update other members' rows. Also allows
  users to update their own row (for self-service fields like notification settings).

## FK Changes
- Drops and recreates the `team_members_role_fkey` constraint with `ON UPDATE CASCADE`
  so role key renames propagate automatically.

## Important Notes
1. The UPDATE policy uses `has_permission('team.manage')` for admin actions AND
   `auth.uid() = user_id` for self-updates, covering both the assignBranch/
   assignRole flows and any future self-service fields.
2. The FK is dropped and recreated — no data is lost, only the constraint metadata changes.
*/

-- ─── Add UPDATE policy on team_members ────────────────────────────────────────

DROP POLICY IF EXISTS "team_update_members" ON team_members;
CREATE POLICY "team_update_members" ON team_members FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR has_permission('team.manage')
  )
  WITH CHECK (
    auth.uid() = user_id
    OR has_permission('team.manage')
  );

-- ─── Fix FK: add ON UPDATE CASCADE ─────────────────────────────────────────────

ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_fkey;
ALTER TABLE team_members
  ADD CONSTRAINT team_members_role_fkey
  FOREIGN KEY (role) REFERENCES roles(key) ON DELETE RESTRICT ON UPDATE CASCADE;
