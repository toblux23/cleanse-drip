import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Date / time helpers ──────────────────────────────────────────────────────

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}
function fmtTime(t: string) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function stars(n: number) {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

// ─── Email: new booking ───────────────────────────────────────────────────────

function bookingHtml(d: Record<string, unknown>): string {
  const services = Array.isArray(d.services_requested)
    ? (d.services_requested as string[]).join(", ")
    : String(d.services_requested ?? "—");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0f766e 0%,#0891b2 100%);border-radius:16px 16px 0 0;padding:36px 32px;text-align:center;">
      <p style="margin:0 0 6px;color:rgba(255,255,255,0.75);font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Cleanse &amp; Drip Booking Engine v1.0</p>
      <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.3px;">New Booking Request</h1>
      <p style="margin:10px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">A client has submitted an appointment request.</p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:36px 32px;border:1px solid #e2e8f0;border-top:none;">

      <!-- Client name banner -->
      <div style="background:#f0fdfa;border-left:4px solid #0d9488;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:28px;">
        <p style="margin:0 0 3px;font-size:11px;font-weight:700;color:#0d9488;letter-spacing:0.08em;text-transform:uppercase;">Client</p>
        <p style="margin:0;font-size:22px;font-weight:800;color:#134e4a;">${String(d.full_name ?? "—")}</p>
      </div>

      <!-- Two-col details -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border-radius:8px;width:50%;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Preferred Date</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">${fmtDate(String(d.preferred_date ?? ""))}</p>
          </td>
          <td style="padding:10px 12px 10px 16px;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Preferred Time</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">${fmtTime(String(d.preferred_time ?? ""))}</p>
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border-radius:8px;width:50%;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Email</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;">${String(d.email || "—")}</p>
          </td>
          <td style="padding:10px 12px 10px 16px;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Cellphone</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;">${String(d.cellphone || "—")}</p>
          </td>
        </tr>
      </table>

      <!-- Services -->
      <div style="margin-bottom:28px;">
        <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Services Requested</p>
        <p style="margin:0;font-size:14px;font-weight:600;color:#0f766e;background:#f0fdfa;border-radius:8px;padding:10px 14px;display:inline-block;">${services}</p>
      </div>

      ${d.date_of_birth ? `
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border-radius:8px;width:50%;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Date of Birth</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;">${fmtDate(String(d.date_of_birth))}</p>
          </td>
          <td style="padding:10px 12px 10px 16px;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Address</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;">${String(d.address || "—")}</p>
          </td>
        </tr>
      </table>` : ""}

      ${d.emergency_contact_name ? `
      <div style="background:#fff1f2;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#be123c;letter-spacing:0.08em;text-transform:uppercase;">Emergency Contact</p>
        <p style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">${String(d.emergency_contact_name)} <span style="font-weight:400;color:#64748b;">(${String(d.emergency_contact_relationship || "")})</span></p>
        <p style="margin:4px 0 0;font-size:13px;color:#64748b;">${String(d.emergency_contact_number || "")}</p>
      </div>` : ""}

      <!-- Divider -->
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">

      <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;">
        Log in to the Team Dashboard to confirm or update the booking status.
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:20px 0;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">Cleanse &amp; Drip Booking Engine v1.0 Notification System &middot; This email is for team members only.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Email: new feedback ──────────────────────────────────────────────────────

function feedbackHtml(d: Record<string, unknown>): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0891b2 0%,#0f766e 100%);border-radius:16px 16px 0 0;padding:36px 32px;text-align:center;">
      <p style="margin:0 0 6px;color:rgba(255,255,255,0.75);font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Cleanse &amp; Drip Booking Engine v1.0</p>
      <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.3px;">New Client Feedback</h1>
      <p style="margin:10px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">A client has submitted a feedback response.</p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:36px 32px;border:1px solid #e2e8f0;border-top:none;">

      <!-- Client name + service banner -->
      <div style="background:#ecfeff;border-left:4px solid #0891b2;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:28px;">
        <p style="margin:0 0 3px;font-size:11px;font-weight:700;color:#0891b2;letter-spacing:0.08em;text-transform:uppercase;">From</p>
        <p style="margin:0;font-size:22px;font-weight:800;color:#164e63;">${String(d.name || "Anonymous Client")}</p>
        <p style="margin:6px 0 0;font-size:13px;font-weight:600;color:#0891b2;background:#cffafe;border-radius:6px;padding:4px 10px;display:inline-block;">${String(d.service_availed || "—")}</p>
      </div>

      <!-- Ratings -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:12px 14px;background:#fffbeb;border-radius:8px;width:50%;vertical-align:top;">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#92400e;letter-spacing:0.08em;text-transform:uppercase;">Overall Experience</p>
            <p style="margin:0;font-size:20px;color:#f59e0b;letter-spacing:2px;">${stars(Number(d.overall_satisfaction ?? 0))}</p>
            <p style="margin:4px 0 0;font-size:12px;font-weight:700;color:#78350f;">${Number(d.overall_satisfaction ?? 0)}/5</p>
          </td>
          <td style="padding:12px 14px 12px 16px;vertical-align:top;">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#92400e;letter-spacing:0.08em;text-transform:uppercase;">Staff Professionalism</p>
            <p style="margin:0;font-size:20px;color:#f59e0b;letter-spacing:2px;">${stars(Number(d.staff_professionalism ?? 0))}</p>
            <p style="margin:4px 0 0;font-size:12px;font-weight:700;color:#78350f;">${Number(d.staff_professionalism ?? 0)}/5</p>
          </td>
        </tr>
      </table>

      <!-- Yes/No answers -->
      <div style="margin-bottom:24px;">
        ${[
          ["Procedure explained?", d.procedure_explained],
          ["Would avail again?", d.avail_again],
          ["Would recommend?", d.recommend],
        ].map(([label, val]) => {
          const v = String(val ?? "—");
          const color = v === "Yes" ? "#059669" : v === "No" ? "#dc2626" : "#d97706";
          const bg = v === "Yes" ? "#f0fdf4" : v === "No" ? "#fef2f2" : "#fffbeb";
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;margin-bottom:8px;background:#f8fafc;border-radius:8px;">
            <span style="font-size:13px;font-weight:600;color:#475569;">${label}</span>
            <span style="font-size:12px;font-weight:700;color:${color};background:${bg};padding:3px 10px;border-radius:20px;">${v}</span>
          </div>`;
        }).join("")}
      </div>

      <!-- Comments -->
      ${d.liked_most ? `
      <div style="margin-bottom:16px;">
        <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">What they liked most</p>
        <div style="background:#f8fafc;border-radius:8px;padding:14px 16px;border-left:3px solid #0d9488;">
          <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">${String(d.liked_most)}</p>
        </div>
      </div>` : ""}

      ${d.comments_suggestions ? `
      <div style="margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Comments &amp; Suggestions</p>
        <div style="background:#f8fafc;border-radius:8px;padding:14px 16px;border-left:3px solid #64748b;">
          <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">${String(d.comments_suggestions)}</p>
        </div>
      </div>` : ""}

      <div style="background:#f8fafc;border-radius:8px;padding:10px 14px;margin-bottom:24px;">
        <span style="font-size:12px;color:#94a3b8;">Marketing consent: </span>
        <span style="font-size:12px;font-weight:700;color:#475569;">${String(d.marketing_consent || "—")}</span>
      </div>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;">
        Log in to the Team Dashboard to view all feedback responses.
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:20px 0;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">Cleanse &amp; Drip Booking Engine v1.0 Notification System &middot; This email is for team members only.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Email: feedback request to client ───────────────────────────────────────

function feedbackRequestHtml(d: Record<string, unknown>): string {
  const name = String(d.client_name || "Valued Client");
  const service = String(d.service_name || "your recent session");
  const url = String(d.feedback_url ?? "");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0f766e 0%,#0891b2 100%);border-radius:16px 16px 0 0;padding:40px 32px 36px;text-align:center;">
      <p style="margin:0 0 8px;color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Cleanse &amp; Drip</p>
      <h1 style="margin:0 0 10px;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;line-height:1.2;">How was your experience?</h1>
      <p style="margin:0;color:rgba(255,255,255,0.85);font-size:15px;line-height:1.5;">Your feedback helps us improve and serve you better.</p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:40px 32px;border:1px solid #e2e8f0;border-top:none;">

      <!-- Greeting -->
      <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0f172a;">Hi, ${name}!</p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
        Thank you for choosing Cleanse &amp; Drip for <strong style="color:#0f766e;">${service}</strong>.
        We truly appreciate your trust, and we hope your experience was everything you expected.
      </p>

      <!-- Divider -->
      <div style="height:1px;background:#f1f5f9;margin:0 0 28px;"></div>

      <!-- Value prop -->
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#94a3b8;letter-spacing:0.06em;text-transform:uppercase;">Why it matters</p>
      <p style="margin:0 0 28px;font-size:14px;color:#64748b;line-height:1.7;">
        Your honest feedback helps us train our team, refine our protocols, and keep delivering the quality care you deserve. It takes less than 2 minutes.
      </p>

      <!-- CTA button -->
      <div style="text-align:center;margin:0 0 32px;">
        <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#0f766e 0%,#0891b2 100%);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:12px;letter-spacing:0.02em;">
          Share Your Feedback &rarr;
        </a>
        <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;">Or copy this link: <span style="color:#0891b2;">${url}</span></p>
      </div>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;">
      <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;line-height:1.6;">
        This is an automated message from Cleanse &amp; Drip.<br>
        If you did not recently visit us, please disregard this email.
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:20px 0;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">Cleanse &amp; Drip Booking Engine v1.0 &middot; Thank you for being our client.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Email: booking confirmation to client ────────────────────────────────────

function bookingConfirmationHtml(d: Record<string, unknown>): string {
  const clientName = String(d.client_name ?? "Valued Client");
  const serviceName = String(d.service_name ?? "—");
  const appointmentDate = String(d.appointment_date ?? "—");
  const appointmentTime = String(d.appointment_time ?? "—");
  const serviceLocation = String(d.service_location ?? "—");
  const nurseName = String(d.nurse_name ?? "To be assigned");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0f766e 0%,#0891b2 100%);border-radius:16px 16px 0 0;padding:40px 32px 36px;text-align:center;">
      <p style="margin:0 0 8px;color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Cleanse &amp; Drip</p>
      <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;line-height:1.2;">Your Appointment Is Confirmed &#9889;</h1>
      <p style="margin:10px 0 0;color:rgba(255,255,255,0.85);font-size:15px;line-height:1.5;">Your wellness session is officially confirmed.</p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:40px 32px;border:1px solid #e2e8f0;border-top:none;">

      <!-- Greeting -->
      <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0f172a;">Hi, ${clientName}!</p>
      <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.7;">
        Your wellness session is officially confirmed. Here are your appointment details:
      </p>

      <!-- Appointment details -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr>
          <td style="padding:12px 14px;background:#f0fdfa;border-radius:8px;width:50%;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#0d9488;letter-spacing:0.08em;text-transform:uppercase;">Treatment</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#134e4a;">${serviceName}</p>
          </td>
          <td style="padding:12px 14px 12px 16px;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#0d9488;letter-spacing:0.08em;text-transform:uppercase;">Assigned Nurse</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#134e4a;">${nurseName}</p>
          </td>
        </tr>
      </table>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr>
          <td style="padding:12px 14px;background:#f8fafc;border-radius:8px;width:50%;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Date</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">${appointmentDate}</p>
          </td>
          <td style="padding:12px 14px 12px 16px;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Time</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">${appointmentTime}</p>
          </td>
        </tr>
      </table>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr>
          <td style="padding:12px 14px;background:#f8fafc;border-radius:8px;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Location</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">${serviceLocation}</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 12px;font-size:14px;color:#475569;line-height:1.7;">
        Kindly ensure that all information provided is complete and accurate. This allows our medical team to properly review your details and prepare for your session.
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:#475569;line-height:1.7;">
        If you need assistance or would like to make changes to your booking, you may reach us at <strong style="color:#0f766e;">09496699606</strong>.
      </p>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0f766e;">Everything is set. We look forward to bringing your wellness experience directly to you.</p>
      <p style="margin:8px 0 0;font-size:14px;color:#475569;line-height:1.7;">Stay well. Stay anchored.</p>
      <p style="margin:16px 0 0;font-size:15px;font-weight:800;color:#0f172a;">Cleanse &amp; Drip</p>
      <p style="margin:2px 0 0;font-size:12px;color:#94a3b8;">Professional Healthcare, Wherever You Are</p>
      <p style="margin:4px 0 0;"><a href="https://cleansedrip.ph" style="font-size:12px;color:#0891b2;text-decoration:none;">https://cleansedrip.ph</a></p>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:20px 0;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">Cleanse &amp; Drip Booking Engine v1.0 &middot; Thank you for being our client.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Email: appointment completed thank-you to client ────────────────────────

function appointmentCompletedHtml(d: Record<string, unknown>): string {
  const clientFirstName = String(d.client_first_name ?? "Valued Client");
  const serviceName = String(d.service_name ?? "—");
  const appointmentDate = String(d.appointment_date ?? "—");
  const amountPaid = String(d.amount_paid ?? "—");
  const paymentMethod = String(d.payment_method ?? "—");
  const transactionReference = String(d.transaction_reference ?? "—");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0f766e 0%,#0891b2 100%);border-radius:16px 16px 0 0;padding:40px 32px 36px;text-align:center;">
      <p style="margin:0 0 8px;color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Cleanse &amp; Drip</p>
      <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;line-height:1.2;">Session Is Complete &#9913;</h1>
      <p style="margin:10px 0 0;color:rgba(255,255,255,0.85);font-size:15px;line-height:1.5;">Your Cleanse &amp; Drip transaction has been successfully completed.</p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:40px 32px;border:1px solid #e2e8f0;border-top:none;">

      <!-- Greeting -->
      <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0f172a;">Hi, ${clientFirstName}!</p>
      <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.7;">
        Your Cleanse &amp; Drip transaction has been successfully completed.
      </p>

      <!-- Transaction summary -->
      <p style="margin:0 0 14px;font-size:12px;font-weight:700;color:#0d9488;letter-spacing:0.08em;text-transform:uppercase;">Transaction Summary</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr>
          <td style="padding:12px 14px;background:#f0fdfa;border-radius:8px;width:50%;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#0d9488;letter-spacing:0.08em;text-transform:uppercase;">Treatment</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#134e4a;">${serviceName}</p>
          </td>
          <td style="padding:12px 14px 12px 16px;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#0d9488;letter-spacing:0.08em;text-transform:uppercase;">Session Date</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#134e4a;">${appointmentDate}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 14px;background:#f8fafc;border-radius:8px;width:50%;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Amount Paid</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">${amountPaid}</p>
          </td>
          <td style="padding:12px 14px 12px 16px;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Payment Method</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">${paymentMethod}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 14px;background:#f8fafc;border-radius:8px;vertical-align:top;" colspan="2">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Reference Number</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">${transactionReference}</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 12px;font-size:14px;color:#475569;line-height:1.7;">
        Thank you for choosing Cleanse &amp; Drip as part of your wellness journey. We hope your experience felt seamless, comfortable, and thoughtfully cared for from booking to completion.
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:#475569;line-height:1.7;">
        If you have any questions following your session, our team remains available to assist you. For your next treatment, you may book through the link below:
      </p>

      <!-- Book again CTA -->
      <div style="background:#f0fdfa;border-left:4px solid #0d9488;border-radius:0 8px 8px 0;padding:18px 20px;margin-bottom:28px;">
        <a href="https://booking.cleansedrip.ph" style="display:inline-block;background:linear-gradient(135deg,#0f766e 0%,#0891b2 100%);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:0.02em;">
          Book Your Next Session &rarr;
        </a>
      </div>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0f766e;">Until your next wellness stop.</p>
      <p style="margin:8px 0 0;font-size:14px;color:#475569;line-height:1.7;">Stay well. Stay anchored.</p>
      <p style="margin:16px 0 0;font-size:15px;font-weight:800;color:#0f172a;">Cleanse &amp; Drip</p>
      <p style="margin:2px 0 0;font-size:12px;color:#94a3b8;">Professional Healthcare, Wherever You Are</p>
      <p style="margin:4px 0 0;"><a href="https://cleansedrip.ph" style="font-size:12px;color:#0891b2;text-decoration:none;">https://cleansedrip.ph</a></p>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:20px 0;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">Cleanse &amp; Drip Booking Engine v1.0 &middot; Thank you for being our client.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const smtpHostname = Deno.env.get("SMTP_HOST");
    const smtpUsername = Deno.env.get("SMTP_USERNAME");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const smtpPort = Number(Deno.env.get("SMTP_PORT") ?? "465");

    if (!smtpHostname || !smtpUsername || !smtpPassword) {
      return new Response(
        JSON.stringify({ error: "SMTP_HOST, SMTP_USERNAME, or SMTP_PASSWORD is not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { type, data, to } = await req.json() as {
      type: "booking" | "feedback" | "feedback_request" | "booking_confirmation" | "appointment_completed";
      data: Record<string, unknown>;
      to?: string[];
    };

    let recipients: { email: string }[];

    if (to && to.length > 0) {
      // A caller-supplied recipient list turns this function into an email relay
      // sending from the clinic's own SMTP identity, so it requires an approved
      // team member. The anon key alone satisfies verify_jwt and is public, so
      // the bearer token must resolve to a real user — not just parse.
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Missing authorization header" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const caller = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } },
      );

      const { data: { user }, error: userErr } = await caller.auth.getUser();
      if (userErr || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: member } = await caller
        .from("team_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .maybeSingle();

      if (!member) {
        return new Response(
          JSON.stringify({ error: "Permission denied: approved team member required." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      recipients = to.map(email => ({ email }));
    } else if (type === "feedback_request" || type === "booking_confirmation" || type === "appointment_completed") {
      // feedback_request, booking_confirmation, and appointment_completed must always supply a `to` address
      return new Response(
        JSON.stringify({ error: `${type} requires a \`to\` address.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else {
      // Use service role key to bypass RLS and read approved team members
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      // Fetch approved members + their notification settings in parallel
      const [membersRes, settingsRes] = await Promise.all([
        supabase.from("team_members").select("id, email").eq("status", "approved"),
        supabase.from("notification_settings").select("team_member_id, notify_booking, notify_intake_form"),
      ]);

      if (membersRes.error) throw new Error(`Failed to fetch team members: ${membersRes.error.message}`);
      if (!membersRes.data || membersRes.data.length === 0) {
        return new Response(
          JSON.stringify({ message: "No approved team members to notify." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Build settings map — members with no row default to all notifications ON
      const settingsMap = new Map<string, { notify_booking: boolean; notify_intake_form: boolean }>(
        (settingsRes.data ?? []).map(s => [
          s.team_member_id,
          { notify_booking: s.notify_booking, notify_intake_form: s.notify_intake_form },
        ])
      );

      // Filter based on notification type
      const notifKey = type === "booking" ? "notify_booking" : "notify_intake_form";
      recipients = membersRes.data.filter(m => {
        const prefs = settingsMap.get(m.id);
        return prefs === undefined ? true : prefs[notifKey];
      });

      if (recipients.length === 0) {
        return new Response(
          JSON.stringify({ message: `No team members have ${type} notifications enabled.` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const fromEmail = Deno.env.get("NOTIFICATION_FROM_EMAIL") ?? smtpUsername;

    const subject = type === "booking"
      ? `New Booking Request — ${String(data.full_name ?? "Unknown")}`
      : type === "feedback_request"
      ? `How was your experience, ${String(data.client_name || "Valued Client")}?`
      : type === "booking_confirmation"
      ? `Your Cleanse & Drip Appointment Is Confirmed \u2693`
      : type === "appointment_completed"
      ? `Cleanse & Drip Session Is Complete \u2693`
      : `New Client Feedback — ${String(data.name || "Anonymous")}`;

    const html = type === "booking"
      ? bookingHtml(data)
      : type === "feedback_request"
      ? feedbackRequestHtml(data)
      : type === "booking_confirmation"
      ? bookingConfirmationHtml(data)
      : type === "appointment_completed"
      ? appointmentCompletedHtml(data)
      : feedbackHtml(data);

    // Port 465 = direct TLS (SSL); port 587 = STARTTLS (tls: false lets denomailer upgrade)
    const useTls = smtpPort === 465;

    const client = new SMTPClient({
      connection: {
        hostname: smtpHostname,
        port: smtpPort,
        tls: useTls,
        auth: { username: smtpUsername, password: smtpPassword },
      },
    });

    const plainText = type === "booking"
      ? `New Booking Request\n\nClient: ${String(data.full_name ?? "—")}\nEmail: ${String(data.email || "—")}\nPhone: ${String(data.cellphone || "—")}\nDate: ${String(data.preferred_date ?? "—")}\nTime: ${String(data.preferred_time ?? "—")}\n\nLog in to the Team Dashboard to manage this booking.`
      : type === "feedback_request"
      ? `Hi ${String(data.client_name || "there")},\n\nThank you for choosing Cleanse & Drip for ${String(data.service_name || "your recent session")}!\n\nWe'd love to hear how your experience went. Please take 2 minutes to share your feedback:\n${String(data.feedback_url ?? "")}\n\nThank you!`
      : type === "booking_confirmation"
      ? `Hi ${String(data.client_name || "Valued Client")},\n\nYour wellness session is officially confirmed.\n\nHere are your appointment details:\nTreatment: ${String(data.service_name ?? "—")}\nDate: ${String(data.appointment_date ?? "—")}\nTime: ${String(data.appointment_time ?? "—")}\nLocation: ${String(data.service_location ?? "—")}\nAssigned Nurse: ${String(data.nurse_name ?? "To be assigned")}\n\nKindly ensure that all information provided is complete and accurate. This allows our medical team to properly review your details and prepare for your session.\n\nIf you need assistance or would like to make changes to your booking, you may reach us at 09496699606.\n\nEverything is set. We look forward to bringing your wellness experience directly to you.\n\nStay well. Stay anchored.\n\nCleanse & Drip\nProfessional Healthcare, Wherever You Are\nhttps://cleansedrip.ph`
      : type === "appointment_completed"
      ? `Hi ${String(data.client_first_name || "Valued Client")},\n\nYour Cleanse & Drip transaction has been successfully completed.\n\nTransaction Summary:\nTreatment: ${String(data.service_name ?? "—")}\nSession Date: ${String(data.appointment_date ?? "—")}\nAmount Paid: ${String(data.amount_paid ?? "—")}\nPayment Method: ${String(data.payment_method ?? "—")}\nReference Number: ${String(data.transaction_reference ?? "—")}\n\nThank you for choosing Cleanse & Drip as part of your wellness journey. We hope your experience felt seamless, comfortable, and thoughtfully cared for from booking to completion.\n\nIf you have any questions following your session, our team remains available to assist you. For your next treatment, you may book through the link below:\nhttps://booking.cleansedrip.ph\n\nUntil your next wellness stop.\nStay well. Stay anchored.\n\nCleanse & Drip\nProfessional Healthcare, Wherever You Are\nhttps://cleansedrip.ph`
      : `New Client Feedback\n\nFrom: ${String(data.name || "Anonymous")}\nService: ${String(data.service_availed || "—")}\nOverall: ${String(data.overall_satisfaction ?? "—")}/5\n\nLog in to the Team Dashboard to view full feedback.`;

    // Send email to each recipient
    const results = await Promise.allSettled(
      recipients.map((member) =>
        client.send({
          from: `Cleanse & Drip <${fromEmail}>`,
          to: member.email,
          subject,
          content: plainText,
          html,
        })
      ),
    );

    await client.close();

    const sent = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").map(
      r => (r as PromiseRejectedResult).reason?.message ?? "Unknown error",
    );

    return new Response(
      JSON.stringify({
        sent,
        failed: failed.length > 0 ? failed : undefined,
        debug: { smtp: smtpHostname, port: smtpPort, tls: useTls, from: fromEmail },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
