import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// CORS enabled on this function by deliberate choice (2026-09-28): a
// write:intake key is meant to be usable directly from a partner's own
// browser-side form, not only their backend. That means the key sits in
// client-visible JS wherever it's used this way — anyone with dev tools open
// on that page can read it. Treat write:intake keys as closer to a
// "publishable" key than a secret one: fine to embed in a page, but the
// blast radius of one leaking is "someone can submit intake records," not
// "someone can read other customers' data" (this key still can't do that —
// see the scope check below). partner-api's read-scoped keys are unaffected
// and remain server-to-server only.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};
const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };

const RATE_LIMIT_PER_MINUTE = 30;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Only digits, spaces, dashes, parens, and a leading + are allowed characters
// (rejects "hello", "abc123", etc.), and there must be 7-15 actual digits in
// it (E.164's max is 15; 7 is a reasonable floor for even a short local
// number) — rejects things like "----" that pass the character check alone.
function isValidPhone(s: string): boolean {
  if (!/^[+\d\s\-().]+$/.test(s)) return false;
  const digits = s.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}
const GENDER_VALUES = ["Male", "Female", "Prefer not to say"];
const YES_NO = ["Yes", "No"];
const YES_NO_OTHER = ["Yes", "No", "Other"];
const FAMILY_HISTORY_OPTIONS = [
  "Cancer", "Cardiovascular Disease", "Stroke", "Diabetes Mellitus",
  "Thyroid Disorder", "Asthma", "Kidney Disease", "Autoimmune Disorder",
  "Liver Disease", "Obesity", "NONE",
];
const WATER_INTAKE_VALUES = ["Less than 1L", "1-2L", "More than 2L"];
const EXERCISE_VALUES = ["None", "1-2x a week", "3-5x a week", "Daily"];
const ALCOHOL_VALUES = ["Never", "Occasionally", "Frequently"];

// Mirrors BookingForm.tsx's combineYesNoSpecify exactly, so a value stored
// via this API reads identically to one submitted through the website form.
function combineYesNoSpecify(val: string, detail: string | undefined): string {
  if (val === "Yes" || val === "Other") return `${val}: ${(detail ?? "").trim()}`;
  return val;
}

interface IntakePayload {
  email?: string; full_name?: string; phone?: string; age?: number;
  birthday?: string; gender?: string; address?: string;
  appointment_date?: string; appointment_time?: string;
  emergency_contact_name?: string; emergency_contact_phone?: string;
  weight?: string;
  pregnant?: string;
  pre_existing_conditions?: string; pre_existing_conditions_detail?: string;
  family_history?: string[];
  medications?: string; medications_detail?: string;
  allergies?: string; allergies_detail?: string;
  bleeding_disorders?: string;
  water_intake?: string;
  exercise_frequency?: string;
  alcohol_consumption?: string;
  smoking_vaping?: string;
  services?: string[];
  consent_given?: boolean;
}

// Validates every field BookingForm.tsx's goNext()/handleSubmit() check
// client-side today, server-side — this API has no browser UI in front of it
// to enforce anything, so this is the only gate. Returns a field-keyed error
// map (empty if valid) so the partner's own form can show per-field messages.
function validate(p: IntakePayload, activeServiceNames: Set<string>): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!p.full_name?.trim()) errors.full_name = "Required";
  if (!p.email?.trim() || !EMAIL_RE.test(p.email.trim())) errors.email = "Valid email required";
  if (!p.phone?.trim() || !isValidPhone(p.phone.trim())) errors.phone = "Valid phone number required (7-15 digits)";
  if (!p.age || !Number.isInteger(p.age) || p.age <= 0) errors.age = "Required, positive whole number";
  if (p.birthday) {
    const d = new Date(p.birthday);
    if (Number.isNaN(d.getTime()) || d > new Date()) errors.birthday = "Must be a valid past date";
  }
  if (!p.gender || !GENDER_VALUES.includes(p.gender)) errors.gender = `Must be one of: ${GENDER_VALUES.join(", ")}`;
  if (!p.address?.trim()) errors.address = "Required";

  if (!p.appointment_date) {
    errors.appointment_date = "Required";
  } else {
    const d = new Date(p.appointment_date);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (Number.isNaN(d.getTime()) || d < today) errors.appointment_date = "Must be today or a future date";
  }
  if (!p.appointment_time?.trim()) errors.appointment_time = "Required";

  if (!p.emergency_contact_name?.trim()) errors.emergency_contact_name = "Required";
  if (!p.emergency_contact_phone?.trim() || !isValidPhone(p.emergency_contact_phone.trim())) {
    errors.emergency_contact_phone = "Valid phone number required (7-15 digits)";
  }

  if (!p.pregnant || !YES_NO.includes(p.pregnant)) errors.pregnant = "Must be Yes or No";
  if (!p.bleeding_disorders || !YES_NO.includes(p.bleeding_disorders)) errors.bleeding_disorders = "Must be Yes or No";
  if (!p.smoking_vaping || !YES_NO.includes(p.smoking_vaping)) errors.smoking_vaping = "Must be Yes or No";

  for (const [base, detail, key] of [
    [p.pre_existing_conditions, p.pre_existing_conditions_detail, "pre_existing_conditions"],
    [p.medications, p.medications_detail, "medications"],
    [p.allergies, p.allergies_detail, "allergies"],
  ] as [string | undefined, string | undefined, string][]) {
    if (!base || !YES_NO_OTHER.includes(base)) {
      errors[key] = `Must be one of: ${YES_NO_OTHER.join(", ")}`;
    } else if ((base === "Yes" || base === "Other") && !detail?.trim()) {
      errors[`${key}_detail`] = "Required when answer is Yes or Other";
    }
  }

  if (!Array.isArray(p.family_history) || p.family_history.length === 0) {
    errors.family_history = "Select at least one option";
  } else if (p.family_history.some((v) => !FAMILY_HISTORY_OPTIONS.includes(v))) {
    errors.family_history = `Each value must be one of: ${FAMILY_HISTORY_OPTIONS.join(", ")}`;
  }

  if (p.water_intake && !WATER_INTAKE_VALUES.includes(p.water_intake)) {
    errors.water_intake = `Must be one of: ${WATER_INTAKE_VALUES.join(", ")}`;
  }
  if (!p.exercise_frequency || !EXERCISE_VALUES.includes(p.exercise_frequency)) {
    errors.exercise_frequency = `Must be one of: ${EXERCISE_VALUES.join(", ")}`;
  }
  if (!p.alcohol_consumption || !ALCOHOL_VALUES.includes(p.alcohol_consumption)) {
    errors.alcohol_consumption = `Must be one of: ${ALCOHOL_VALUES.join(", ")}`;
  }

  if (!Array.isArray(p.services) || p.services.length === 0) {
    errors.services = "Select at least one service";
  } else {
    const unknown = p.services.filter((s) => s !== "Consultation" && !activeServiceNames.has(s));
    if (unknown.length > 0) errors.services = `Unknown or inactive service(s): ${unknown.join(", ")}`;
  }

  if (p.consent_given !== true) errors.consent_given = "Must be true — all consent items must be agreed to";

  return errors;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/partner-intake/, "") || "/";

  let apiKeyId: string | null = null;
  let statusForLog = 500;

  try {
    if (req.method !== "POST") {
      statusForLog = 405;
      return json({ error: "Method not allowed." }, 405);
    }

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
      .select("id, label, revoked_at, scopes")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (keyErr || !keyRow || keyRow.revoked_at) {
      statusForLog = 401;
      return json({ error: "Invalid or revoked API key." }, 401);
    }
    apiKeyId = keyRow.id;

    const scopes: string[] = keyRow.scopes ?? [];
    if (!scopes.includes("write:intake")) {
      statusForLog = 403;
      return json({ error: "This key does not have the write:intake scope." }, 403);
    }

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

    admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKeyId)
      .then(() => {}, () => {});

    // ── Parse + validate the payload ───────────────────────────────────────
    let payload: IntakePayload;
    try {
      payload = await req.json();
    } catch {
      statusForLog = 400;
      return json({ error: "Invalid JSON body." }, 400);
    }

    const { data: activeServices } = await admin
      .from("catalog_items").select("name").eq("is_active", true);
    const activeServiceNames = new Set((activeServices ?? []).map((s: { name: string }) => s.name));

    const errors = validate(payload, activeServiceNames);
    if (Object.keys(errors).length > 0) {
      statusForLog = 400;
      return json({ errors }, 400);
    }

    // ── Confirm the requested slot is actually open ────────────────────────
    // Reuses the same computation the public availability widget uses, rather
    // than re-implementing the buffer/booked/past logic a third time.
    const { data: dayAvailability, error: availErr } = await admin.rpc("get_availability", {
      p_start: payload.appointment_date,
      p_end: payload.appointment_date,
    });
    if (availErr) throw availErr;

    const requestedTime = payload.appointment_time!.slice(0, 5); // "HH:MM"
    const matchingSlot = (dayAvailability ?? []).find(
      (s: { slot_time: string; status: string }) => s.slot_time.slice(0, 5) === requestedTime,
    );
    if (!matchingSlot) {
      statusForLog = 400;
      return json({ errors: { appointment_time: "Not a valid time slot." } }, 400);
    }
    if (matchingSlot.status !== "available") {
      statusForLog = 400;
      return json({ errors: { appointment_time: `Not available (${matchingSlot.status}).` } }, 400);
    }

    // ── Resolve/create the client, exactly as BookingForm.tsx does ─────────
    const email = payload.email!.trim();
    const phone = payload.phone!.trim();

    const { data: resolvedClientId, error: clientErr } = await admin.rpc(
      "intake_upsert_client_and_profile",
      {
        p_client: {
          full_name: payload.full_name!.trim(),
          email: email || null,
          phone: phone || null,
          address: payload.address!.trim() || null,
        },
        p_profile: {
          date_of_birth: payload.birthday || null,
          age: payload.age ?? null,
          gender: payload.gender || null,
          emergency_contact_name: payload.emergency_contact_name!.trim() || null,
          emergency_contact_number: payload.emergency_contact_phone!.trim() || null,
          allergies: combineYesNoSpecify(payload.allergies!, payload.allergies_detail) || null,
          current_medications: combineYesNoSpecify(payload.medications!, payload.medications_detail) || null,
          pregnancy_breastfeeding: payload.pregnant || null,
          pre_existing_conditions: combineYesNoSpecify(payload.pre_existing_conditions!, payload.pre_existing_conditions_detail) || null,
          bleeding_disorders: payload.bleeding_disorders || null,
          family_history: payload.family_history,
          weight: payload.weight?.trim() || null,
          smoking_vaping: payload.smoking_vaping || null,
          alcohol_consumption: payload.alcohol_consumption || null,
          exercise_frequency: payload.exercise_frequency || null,
          water_intake: payload.water_intake || null,
          consent_given: true,
          consent_date: new Date().toISOString(),
        },
      },
    );

    if (clientErr || !resolvedClientId) {
      statusForLog = 500;
      return json({ error: "Failed to resolve client record." }, 500);
    }
    const clientId: string = resolvedClientId as string;

    // ── Insert the booking ───────────────────────────────────────────────
    const bookingPayload = {
      client_id: clientId,
      email,
      full_name: payload.full_name!.trim(),
      preferred_date: payload.appointment_date,
      preferred_time: payload.appointment_time,
      address: payload.address!.trim(),
      cellphone: phone,
      age: payload.age,
      date_of_birth: payload.birthday || null,
      gender: payload.gender,
      emergency_contact_name: payload.emergency_contact_name!.trim(),
      emergency_contact_number: payload.emergency_contact_phone!.trim(),
      weight: payload.weight?.trim() || null,
      is_pregnant_breastfeeding: payload.pregnant,
      pre_existing_condition: combineYesNoSpecify(payload.pre_existing_conditions!, payload.pre_existing_conditions_detail),
      family_history: payload.family_history,
      taking_medications: combineYesNoSpecify(payload.medications!, payload.medications_detail),
      has_allergies: combineYesNoSpecify(payload.allergies!, payload.allergies_detail),
      bleeding_disorders: payload.bleeding_disorders,
      water_intake: payload.water_intake || null,
      exercise_frequency: payload.exercise_frequency,
      alcohol_consumption: payload.alcohol_consumption,
      smoking_vaping: payload.smoking_vaping,
      services_requested: payload.services,
      consent_given: true,
      // Identifies API-submitted bookings at a glance in the team dashboard,
      // distinct from the ?src= branch tracking the website form uses.
      source: `api:${keyRow.label}`,
      intake_form_status: "COMPLETED" as const,
    };

    const { data: inserted, error: insertErr } = await admin
      .from("client_bookings").insert(bookingPayload).select("id").single();
    if (insertErr) throw insertErr;

    // Fire-and-forget staff notification — same as the website form, so an
    // API-submitted booking is visible to staff the same way, not a blind
    // channel.
    admin.functions.invoke("send-notification-email", {
      body: { type: "booking", data: bookingPayload },
    }).then(() => {}, () => {});

    statusForLog = 201;
    return json({ client_id: clientId, booking_id: inserted.id }, 201);
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
