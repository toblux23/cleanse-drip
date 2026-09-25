/*
# Partner API keys — customer lookup / upcoming appointments / appointment detail

## Purpose
A third-party integration (e.g. a booking assistant) needs to, given only a
phone or email:
  1. resolve a customer
  2. list that customer's upcoming appointments
  3. read one appointment's details

This is a different trust model from everything else in this schema: the
caller has no Supabase session, no auth.uid(), no team_members row — just a
bearer credential issued out-of-band. It is served by an Edge Function
(`partner-api`) using the service-role key internally; nothing here is reached
through PostgREST directly, and RLS on the two new tables below is default-deny
for every Postgres role except service_role — there is deliberately no
policy that lets an authenticated *or* anon request touch them at all.

## Design choices worth calling out
- The raw key is shown exactly once, at creation, in create_api_key()'s return
  value. Only its SHA-256 hash and an 8-char prefix (for identifying a key in
  a list without being able to reconstruct it) are stored — same reason
  passwords are hashed, not stored.
- Key management (create/list/revoke) is superadmin-gated via a new
  `api.manage` permission, mirroring the existing has_permission() pattern
  rather than inventing a separate authorization path.
- api_request_log exists for two reasons at once: it's the audit trail, and
  the Edge Function uses it as a rolling-window rate limiter (count this key's
  rows in the last 60s) — a partner integration doing a phone/email lookup is
  effectively an oracle for "is this person a customer," so unlimited-rate
  guessing is the specific thing being priced out here.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- api_keys
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label        text NOT NULL,
  key_hash     text NOT NULL UNIQUE,
  key_prefix   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  revoked_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
-- No policies at all: authenticated and anon get zero access, by omission.
-- Only service_role (which bypasses RLS) and the SECURITY DEFINER RPCs below
-- ever touch this table.

-- ═══════════════════════════════════════════════════════════════════════════
-- api_request_log — audit trail + rate-limit window
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.api_request_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id  uuid REFERENCES public.api_keys(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  status_code int NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_request_log_key_time_idx
  ON public.api_request_log (api_key_id, created_at DESC);

ALTER TABLE public.api_request_log ENABLE ROW LEVEL SECURITY;
-- Same as above: no policies, service_role only.

-- ═══════════════════════════════════════════════════════════════════════════
-- Permission: api.manage
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO permissions (key, label, description) VALUES
  ('api.manage', 'Manage API Keys', 'Create, list, and revoke partner API keys')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.key = 'superadmin' AND p.key = 'api.manage'
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- RPCs
-- ═══════════════════════════════════════════════════════════════════════════

-- Returns the raw key exactly once. Caller must save it now; it cannot be
-- retrieved again (only key_hash is stored, and hashes don't invert).
CREATE OR REPLACE FUNCTION public.create_api_key(p_label text)
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

  v_raw  := 'cd_live_' || encode(gen_random_bytes(24), 'hex');
  v_hash := encode(digest(v_raw, 'sha256'), 'hex');

  INSERT INTO api_keys (label, key_hash, key_prefix, created_by)
  VALUES (trim(p_label), v_hash, left(v_raw, 16), auth.uid())
  RETURNING api_keys.id INTO v_id;

  RETURN QUERY SELECT v_id, v_raw;
END;
$$;

REVOKE ALL ON FUNCTION public.create_api_key(text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_api_key(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_api_keys()
RETURNS TABLE(
  id uuid, label text, key_prefix text, created_at timestamptz,
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
    SELECT ak.id, ak.label, ak.key_prefix, ak.created_at, ak.last_used_at, ak.revoked_at
    FROM api_keys ak
    ORDER BY ak.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_api_keys() FROM public;
GRANT EXECUTE ON FUNCTION public.list_api_keys() TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_api_key(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission('api.manage') THEN
    RAISE EXCEPTION 'Permission denied: api.manage required' USING ERRCODE = '42501';
  END IF;
  UPDATE api_keys SET revoked_at = now(), revoked_by = auth.uid()
  WHERE id = p_id AND revoked_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_api_key(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.revoke_api_key(uuid) TO authenticated;
