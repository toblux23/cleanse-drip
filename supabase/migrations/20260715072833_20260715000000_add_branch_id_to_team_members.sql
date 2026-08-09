/*
# Add branch_id to team_members

## Summary
Adds a nullable `branch_id` column to `team_members` so that staff (especially nurses)
can be assigned to a specific branch. The nurse dashboard uses this to scope
appointments and operations to the nurse's branch.

## Modified Tables

### team_members
- `branch_id` (uuid, nullable, FK → branches.id ON DELETE SET NULL)
  Nullable so existing team members are unaffected. When set, the nurse dashboard
  filters appointments to this branch.

## Security
- No RLS policy changes needed. The column is readable by any authenticated user
  (existing SELECT policy covers it). Updates to team_members are already
  restricted to superadmin via RPCs (SECURITY DEFINER).

## Important Notes
1. Column is nullable — existing rows and the auto-provisioning trigger are unaffected.
2. An index on branch_id helps future branch-filtered queries on team members.
*/

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS team_members_branch_id_idx ON team_members (branch_id);
