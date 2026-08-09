/*
# Fix RBAC: Add INSERT/DELETE policies on role_permissions

## Summary
The SettingsTab's permission toggle does direct client-side INSERT and DELETE
on `role_permissions`, but only a SELECT policy existed — RLS silently blocked
all writes, making the permission management UI completely non-functional.

## RLS Changes
- Adds INSERT policy: `has_permission('settings.manage')`
- Adds DELETE policy: `has_permission('settings.manage')`

## Important Notes
1. Gated by `settings.manage` (not `team.manage`) since permission configuration
   is a settings-level action, separate from team member management.
2. The SettingsTab is already gated behind `can('settings.manage')` in Dashboard,
   so only users who can see the tab can write to role_permissions.
*/

DROP POLICY IF EXISTS "team_insert_role_permissions" ON role_permissions;
CREATE POLICY "team_insert_role_permissions" ON role_permissions FOR INSERT
  TO authenticated
  WITH CHECK (has_permission('settings.manage'));

DROP POLICY IF EXISTS "team_delete_role_permissions" ON role_permissions;
CREATE POLICY "team_delete_role_permissions" ON role_permissions FOR DELETE
  TO authenticated
  USING (has_permission('settings.manage'));
