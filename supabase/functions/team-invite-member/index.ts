import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InviteBody {
  email: string;
  full_name?: string;
  role?: string;
  branch_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: InviteBody = await req.json();
    const email = (body.email ?? "").trim().toLowerCase();
    const fullName = (body.full_name ?? "").trim() || null;
    const roleKey = (body.role ?? "").trim() || null;
    const branchId = (body.branch_id ?? "").trim() || null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "A valid email is required." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Caller client (anon key, RLS-enforced) — verify team.add permission
    const callerUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const callerAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const caller = createClient(callerUrl, callerAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await caller.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check team.add permission via has_permission
    const { data: permOk, error: permErr } = await caller.rpc("has_permission", {
      perm_key: "team.add",
    });
    if (permErr || !permOk) {
      return new Response(JSON.stringify({ error: "Permission denied: team.add required." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for duplicate email in team_members
    const { data: existing } = await caller
      .from("team_members")
      .select("id, status")
      .ilike("email", email)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({
        error: `A team member with email ${email} already exists (status: ${existing.status}).`,
      }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate role if provided
    if (roleKey) {
      const { data: roleRow } = await caller
        .from("roles")
        .select("id")
        .eq("key", roleKey)
        .maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: `Invalid role: ${roleKey}.` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Validate branch if provided
    if (branchId) {
      const { data: branchRow } = await caller
        .from("branches")
        .select("id")
        .eq("id", branchId)
        .eq("is_active", true)
        .maybeSingle();
      if (!branchRow) {
        return new Response(JSON.stringify({ error: "Invalid or inactive branch." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Service-role client for admin invite (NEVER exposed to frontend)
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(callerUrl, serviceKey);

    // Invite the user via Supabase Admin API — trigger fires handle_new_user
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: fullName ? { full_name: fullName } : {},
    });

    if (inviteErr) {
      // If user already exists in auth but not in team_members, surface the error
      return new Response(JSON.stringify({
        error: `Invitation failed: ${inviteErr.message}`,
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = inviteData.user.id;

    // Update the team_members row created by the trigger with full_name, role, branch
    const updates: Record<string, unknown> = {};
    if (fullName) updates.full_name = fullName;
    if (roleKey) updates.role = roleKey;
    if (branchId) updates.branch_id = branchId;

    if (Object.keys(updates).length > 0) {
      const { error: updateErr } = await admin
        .from("team_members")
        .update(updates)
        .eq("user_id", newUserId);
      if (updateErr) {
        // Non-fatal — the member was still invited; log but don't fail
        console.error("Failed to update team_members after invite:", updateErr.message);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      user_id: newUserId,
      email,
      message: `Invitation sent to ${email}. The invitee will receive an email to set their password.`,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
