import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DeleteBody {
  user_id: string;
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

    const body: DeleteBody = await req.json();
    const targetUserId = (body.user_id ?? "").trim();

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "user_id is required." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Check team.delete permission
    const { data: permOk, error: permErr } = await caller.rpc("has_permission", {
      perm_key: "team.delete",
    });
    if (permErr || !permOk) {
      return new Response(JSON.stringify({ error: "Permission denied: team.delete required." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Safety: cannot delete self
    if (targetUserId === user.id) {
      return new Response(JSON.stringify({ error: "You cannot delete your own account." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the target member record
    const { data: targetMember, error: targetErr } = await caller
      .from("team_members")
      .select("user_id, email, role, status")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (targetErr || !targetMember) {
      return new Response(JSON.stringify({ error: "Member not found." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Safety: cannot delete the last active superadmin
    if (targetMember.role === "superadmin" && targetMember.status === "approved") {
      const { count: activeSuperadminCount } = await caller
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("role", "superadmin")
        .eq("status", "approved");

      if ((activeSuperadminCount ?? 0) <= 1) {
        return new Response(JSON.stringify({
          error: "Cannot delete the last active Superadmin. Assign another Superadmin first.",
        }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Service-role client for admin deletion (NEVER exposed to frontend)
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(callerUrl, serviceKey);

    // Delete the auth user — cascades to team_members via FK ON DELETE CASCADE
    const { error: deleteErr } = await admin.auth.admin.deleteUser(targetUserId);

    if (deleteErr) {
      return new Response(JSON.stringify({
        error: `Failed to delete authentication account: ${deleteErr.message}`,
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify team_members row is gone (FK cascade); clean up if not
    const { data: remainingRow } = await admin
      .from("team_members")
      .select("id")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (remainingRow) {
      await admin.from("team_members").delete().eq("user_id", targetUserId);
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Member ${targetMember.email} has been permanently deleted.`,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
