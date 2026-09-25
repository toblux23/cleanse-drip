import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// This function is a server-to-server integration surface, not something the
// app's own browser bundle calls — so no wildcard CORS the way the other
// functions have it. A partner backend doesn't send a browser preflight with
// an Origin that matters; if a specific partner ever needs browser-side CORS,
// scope this to their real origin instead of loosening it back to "*".
const jsonHeaders = { "Content-Type": "application/json" };

const RATE_LIMIT_PER_MINUTE = 30;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ilike treats % and _ as wildcards — escape them so a caller-supplied email
// can only ever match itself, never turn into a substring/wildcard search.
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => "\\" + c);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  // Strip the function's own mount path so routing below is relative:
  // /functions/v1/partner-api/customers -> /customers
  const path = url.pathname.replace(/^.*\/partner-api/, "") || "/";
  const segments = path.split("/").filter(Boolean);

  let apiKeyId: string | null = null;
  let statusForLog = 500;

  try {
    // ── Authenticate the API key ──────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!rawKey) {
      statusForLog = 401;
      return json({ error: "Missing API key." }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const keyHash = await sha256Hex(rawKey);
    const { data: keyRow, error: keyErr } = await admin
      .from("api_keys")
      .select("id, revoked_at, scopes")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (keyErr || !keyRow || keyRow.revoked_at) {
      statusForLog = 401;
      return json({ error: "Invalid or revoked API key." }, 401);
    }
    apiKeyId = keyRow.id;
    const scopes: string[] = keyRow.scopes ?? [];

    // ── Rate limit: this key's own requests in the last 60s ───────────────
    const windowStart = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount } = await admin
      .from("api_request_log")
      .select("id", { count: "exact", head: true })
      .eq("api_key_id", apiKeyId)
      .gte("created_at", windowStart);

    if ((recentCount ?? 0) >= RATE_LIMIT_PER_MINUTE) {
      statusForLog = 429;
      return json({ error: "Rate limit exceeded. Try again shortly." }, 429);
    }

    // Best-effort; a failed timestamp update should never block the request.
    admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKeyId)
      .then(() => {}, () => {});

    if (req.method !== "GET") {
      statusForLog = 405;
      return json({ error: "Method not allowed." }, 405);
    }

    // ── Route: GET /customers?phone=...|email=... ─────────────────────────
    if (segments.length === 1 && segments[0] === "customers") {
      if (!scopes.includes("read:customers")) {
        statusForLog = 403;
        return json({ error: "This key does not have the read:customers scope." }, 403);
      }
      const phone = url.searchParams.get("phone")?.trim();
      const email = url.searchParams.get("email")?.trim().toLowerCase();
      if (!phone && !email) {
        statusForLog = 400;
        return json({ error: "Provide a phone or email query parameter." }, 400);
      }

      let query = admin.from("clients").select("id, full_name, phone, email, status");
      // Exact match only — no ILIKE/wildcard, so this can't be turned into a
      // substring-search oracle over the client list.
      query = email ? query.ilike("email", escapeLike(email)) : query.eq("phone", phone!);

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (!data) {
        statusForLog = 404;
        return json({ error: "No matching customer." }, 404);
      }
      statusForLog = 200;
      return json({ customer: data });
    }

    // ── Route: GET /customers/{clientId}/appointments ─────────────────────
    if (segments.length === 3 && segments[0] === "customers" && segments[2] === "appointments") {
      if (!scopes.includes("read:customers")) {
        statusForLog = 403;
        return json({ error: "This key does not have the read:customers scope." }, 403);
      }
      const clientId = segments[1];
      if (!UUID_RE.test(clientId)) {
        statusForLog = 400;
        return json({ error: "Invalid customer id." }, 400);
      }

      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await admin
        .from("appointments")
        .select("id, service, scheduled_date, scheduled_time, location, status")
        .eq("client_id", clientId)
        .gte("scheduled_date", today)
        .not("status", "in", "(cancelled,completed)")
        .order("scheduled_date", { ascending: true });

      if (error) throw error;
      statusForLog = 200;
      return json({ appointments: data ?? [] });
    }

    // ── Route: GET /appointments/{appointmentId} ───────────────────────────
    if (segments.length === 2 && segments[0] === "appointments") {
      if (!scopes.includes("read:appointments")) {
        statusForLog = 403;
        return json({ error: "This key does not have the read:appointments scope." }, 403);
      }
      const appointmentId = segments[1];
      if (!UUID_RE.test(appointmentId)) {
        statusForLog = 400;
        return json({ error: "Invalid appointment id." }, 400);
      }

      const { data, error } = await admin
        .from("appointments")
        .select("id, client_id, service, scheduled_date, scheduled_time, location, status, nurse_name, assistant_name")
        .eq("id", appointmentId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        statusForLog = 404;
        return json({ error: "Appointment not found." }, 404);
      }
      statusForLog = 200;
      return json({ appointment: data });
    }

    statusForLog = 404;
    return json({ error: "Unknown route." }, 404);
  } catch (err) {
    statusForLog = 500;
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  } finally {
    if (apiKeyId) {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      admin.from("api_request_log").insert({
        api_key_id: apiKeyId,
        endpoint: path,
        status_code: statusForLog,
      }).then(() => {}, () => {});
    }
  }
});
