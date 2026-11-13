import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function generatePassword(length = 16) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, n => alphabet[n % alphabet.length]).join("");
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server configuration error" }, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userResult, error: userError } = await admin.auth.getUser(token);
    if (userError || !userResult.user) return json({ error: "Invalid session" }, 401);

    const { data: actor, error: actorError } = await admin
      .from("profiles")
      .select("role,active")
      .eq("id", userResult.user.id)
      .single();

    if (actorError || !actor?.active || !["owner", "admin"].includes(actor.role)) {
      return json({ error: "Not authorized" }, 403);
    }

    const body = await req.json();
    const mode = String(body.mode || "invite");
    const fullName = String(body.full_name || "").trim();
    const role = String(body.role || "viewer");
    const siteIds = Array.isArray(body.site_ids) ? [...new Set(body.site_ids.map((x: unknown) => String(x)))] : [];

    const validRoles = ["owner", "admin", "mechanic", "operator", "viewer"];
    const allSiteRoles = ["owner", "admin", "mechanic"];
    if (!["invite", "manual_viewer"].includes(mode)) return json({ error: "Invalid mode" }, 400);
    if (!fullName) return json({ error: "Full name is required" }, 400);
    if (!validRoles.includes(role)) return json({ error: "Invalid role" }, 400);

    if (actor.role === "admin" && ["owner", "admin"].includes(role)) {
      return json({ error: "Admins cannot invite Owner/Admin accounts" }, 403);
    }

    if (!allSiteRoles.includes(role) && siteIds.length) {
      const { data: validSites, error: siteError } = await admin
        .from("sites")
        .select("id")
        .in("id", siteIds)
        .eq("archived", false);
      if (siteError) return json({ error: "Selected sites could not be validated" }, 400);
      if ((validSites || []).length !== siteIds.length) {
        return json({ error: "One or more selected sites are invalid or archived" }, 400);
      }
    }


    // Only the service client can invoke these RPCs. Never accept an actor ID
    // from the request body: bind the operation to the verified JWT user.
    const beginAudit = async () => {
      const { data, error } = await admin.rpc("account_audit_begin", {
        p_actor_user_id: userResult.user.id,
        p_mode: mode,
        p_full_name: fullName,
        p_role: role,
        p_site_ids: allSiteRoles.includes(role) ? [] : siteIds,
      });
      if (error || typeof data !== "string" || !data) {
        throw new Error("audit_begin_failed");
      }
      return data;
    };
    const failAudit = async (operationId: string, targetUserId: string | null,
      errorCode: "provider_failed" | "setup_failed" | "cleanup_failed") => {
      try {
        const { error } = await admin.rpc("account_audit_fail", {
          p_operation_id: operationId,
          p_target_user_id: targetUserId,
          p_error_code: errorCode,
        });
        if (error) console.error("account_audit_failure_record_failed");
      } catch {
        console.error("account_audit_failure_record_failed");
      }
    };
    const finalizeAudit = async (operationId: string, targetUserId: string) => {
      let uncertain = false;
      // Finalize is idempotent for the same operation and target. A lost response
      // may hide a committed success, so retry once and never delete on ambiguity.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data, error } = await admin.rpc("account_audit_finalize", {
            p_operation_id: operationId,
            p_target_user_id: targetUserId,
          });
          if (!error && data === true) return "succeeded";
          const rejected = (!error && data === false) ||
            /^(22|23|42|P0)[0-9A-Z]{3}$/.test(error?.code || "");
          if (rejected && !uncertain) return "rejected";
          uncertain = true;
        } catch {
          uncertain = true;
        }
      }
      return "unknown";
    };
    const unconfirmedSetup = () => json({
      error: "Account setup could not be confirmed. Check Users & Access before retrying.",
    }, 500);


    if (mode === "manual_viewer") {
      if (actor.role !== "owner") return json({ error: "Only the Owner can create a manual Viewer login" }, 403);
      if (role !== "viewer") return json({ error: "Manual logins are Viewer-only" }, 400);

      const loginName = slugify(String(body.login_name || "manager-demo")) || "manager-demo";
      const suffix = crypto.randomUUID().slice(0, 8);
      const email = `${loginName}-${suffix}@forged-field-pm.test`;
      const password = generatePassword();

      const operationId = await beginAudit();
      let userId: string;
      try {
        const result = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, manual_viewer: true },
        });
        if (result.error || !result.data?.user) {
          await failAudit(operationId, null, "provider_failed");
          return json({ error: "Manual Viewer account could not be created" }, 400);
        }
        userId = result.data.user.id;
      } catch {
        await failAudit(operationId, null, "provider_failed");
        return json({ error: "Manual Viewer account could not be created" }, 500);
      }

      const outcome = await finalizeAudit(operationId, userId);
      if (outcome !== "succeeded") {
        await failAudit(operationId, userId, "setup_failed");
        if (outcome === "unknown") return unconfirmedSetup();
        try {
          const { error } = await admin.auth.admin.deleteUser(userId);
          if (error) await failAudit(operationId, userId, "cleanup_failed");
        } catch {
          await failAudit(operationId, userId, "cleanup_failed");
        }
        return json({ error: "Manual Viewer account setup failed" }, 500);
      }

      return json({
        ok: true,
        mode: "manual_viewer",
        user_id: userId,
        email,
        password,
        full_name: fullName,
        role: "viewer",
        site_ids: siteIds,
      });
    }

    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return json({ error: "A valid email is required" }, 400);

    const redirectTo = "https://fearincognito.github.io/forged-field-pm-tracker-v3/?invite=1";
    const operationId = await beginAudit();
    let userId: string;
    try {
      const result = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { full_name: fullName },
      });
      if (result.error || !result.data?.user) {
        await failAudit(operationId, null, "provider_failed");
        const conflict = /already|registered|exists/i.test(result.error?.message || "");
        return json({ error: conflict ? "Account already exists" : "Invitation could not be sent" }, conflict ? 409 : 400);
      }
      userId = result.data.user.id;
    } catch {
      await failAudit(operationId, null, "provider_failed");
      return json({ error: "Invitation could not be sent" }, 500);
    }

    const outcome = await finalizeAudit(operationId, userId);
    if (outcome !== "succeeded") {
      await failAudit(operationId, userId, "setup_failed");
      if (outcome === "unknown") return unconfirmedSetup();
      return json({ error: "Invitation was sent but account setup failed" }, 500);
    }

    return json({ ok: true, user_id: userId, email });
  } catch (error) {
    console.error("invite_user_request_failed");
    return json({ error: "Unexpected server error" }, 500);
  }
}

Deno.serve(handleRequest);
