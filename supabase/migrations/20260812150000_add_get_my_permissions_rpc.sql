/*
# get_my_permissions() — remove the last client-supplied ID from permission lookup

## Why

App.tsx's fetchMember() resolved the caller's permission set in two chained
client-driven requests:
    1. SELECT id FROM roles WHERE key = <my role>
    2. SELECT permissions.key FROM role_permissions WHERE role_id = <id from #1>

Both roles and role_permissions are openly readable (USING (true), by design
— the app needs to display role/permission labels generally). That's fine when
the role_id in #2 is the one the app itself computed. It stops being fine the
moment someone intercepts request #2 and swaps role_id for a different role's
id (e.g. superadmin's) — the server has no way to tell that request apart from
a legitimate one, since nothing in it identifies the caller. The response is
trusted into React state with no cross-check, so the UI renders as whatever
role_id was asked for.

This does not affect any actual write — has_permission() independently
re-derives the caller's role from auth.uid() on every privileged mutation,
regardless of what the client displays. But it's the same class of gap as the
team_members self-read (fixed 2026-08-12 in App.tsx directly, not via RLS):
a client-suppliable identifier standing in for "who am I."

## Fix

Collapse both requests into one function that takes no parameters at all —
there is nothing left in the request for a client to substitute, because
identity comes only from auth.uid(), resolved server-side from the verified
JWT before the function body ever runs.
*/

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::text[])
  FROM team_members tm
  JOIN roles r ON r.key = tm.role
  JOIN role_permissions rp ON rp.role_id = r.id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE tm.user_id = auth.uid()
    AND tm.status = 'approved';
$$;

REVOKE ALL ON FUNCTION public.get_my_permissions() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;
