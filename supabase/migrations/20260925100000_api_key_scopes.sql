/*
# Per-key API scoping

## Why
Every api_keys row today can hit every partner-api route — there's no
restriction beyond "is this key valid and unrevoked." That was fine with one
capability (read-only customer/appointment lookup), but adding a write
capability (partner-intake, for external intake submission) onto the same
undifferentiated trust model would mean the existing read-only key could
suddenly submit bookings, and any future intake-only key could read arbitrary
customer records — neither is the intended access for either integration.

## Fix
Add `scopes text[]` to api_keys. create_api_key() now takes the scopes to
grant at creation; list_api_keys() surfaces them so an admin can see what
each key can actually do. The already-issued "Partner API - Production" key
is backfilled with the two read scopes it was implicitly relying on, so
turning on enforcement (in partner-api/index.ts and the new partner-intake
function) doesn't silently break it.

Scope strings are free-form text, checked by the Edge Functions themselves
(read:customers, read:appointments, write:intake) — not constrained by a
CHECK here, since the set of capabilities is expected to grow as more
partner-facing endpoints are added.
*/

ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{}';

UPDATE public.api_keys
SET scopes = ARRAY['read:customers', 'read:appointments']
WHERE label = 'Partner API - Production' AND scopes = '{}';

CREATE OR REPLACE FUNCTION public.create_api_key(p_label text, p_scopes text[])
RETURNS TABLE(id uuid, raw_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw    text;
  v_hash   text;
  v_id     uuid;
BEGIN
  IF NOT has_permission('api.manage') THEN
    RAISE EXCEPTION 'Permission denied: api.manage required' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_label), '') = '' THEN
    RAISE EXCEPTION 'A label is required';
  END IF;
  IF p_scopes IS NULL OR array_length(p_scopes, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one scope is required';
  END IF;

  v_raw  := 'cd_live_' || encode(gen_random_bytes(24), 'hex');
  v_hash := encode(digest(v_raw, 'sha256'), 'hex');

  INSERT INTO api_keys (label, key_hash, key_prefix, created_by, scopes)
  VALUES (trim(p_label), v_hash, left(v_raw, 16), auth.uid(), p_scopes)
  RETURNING api_keys.id INTO v_id;

  RETURN QUERY SELECT v_id, v_raw;
END;
$$;

REVOKE ALL ON FUNCTION public.create_api_key(text, text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.create_api_key(text, text[]) TO authenticated;

-- Drop the old single-argument signature — callers must pass scopes now, so
-- there is no safe default to fall back to (an unscoped key would be able to
-- do nothing, which is a worse failure mode than being loud about it here).
DROP FUNCTION IF EXISTS public.create_api_key(text);

-- Postgres won't let CREATE OR REPLACE change a function's OUT-parameter row
-- type (adding `scopes` here counts as a change), so the old signature has
-- to be dropped first — same reason create_api_key's old signature is
-- dropped above rather than replaced in place.
DROP FUNCTION IF EXISTS public.list_api_keys();

CREATE FUNCTION public.list_api_keys()
RETURNS TABLE(
  id uuid, label text, key_prefix text, scopes text[], created_at timestamptz,
  last_used_at timestamptz, revoked_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission('api.manage') THEN
    RAISE EXCEPTION 'Permission denied: api.manage required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT ak.id, ak.label, ak.key_prefix, ak.scopes, ak.created_at, ak.last_used_at, ak.revoked_at
    FROM api_keys ak
    ORDER BY ak.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_api_keys() FROM public;
GRANT EXECUTE ON FUNCTION public.list_api_keys() TO authenticated;
