import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Role = "admin" | "editor" | "viewer";

type AdminUserRequest = {
  action?: "invite" | "create" | "list" | "delete";
  email?: string;
  password?: string;
  role?: Role;
  redirectTo?: string;
  userId?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function normalizeRole(role: unknown): Role {
  if (role === "admin" || role === "editor" || role === "viewer") return role;
  return "viewer";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const anonKey = getEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization") ?? "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: adminRole, error: roleError } = await adminClient
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();

    if (roleError) return jsonResponse({ error: "Could not verify admin role" }, 500);
    if (!adminRole) return jsonResponse({ error: "Forbidden" }, 403);

    const body = (await req.json()) as AdminUserRequest;
    const action = body.action ?? "invite";

    // ---- LIST ----
    if (action === "list") {
      const { data: usersData, error: listErr } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (listErr) return jsonResponse({ error: listErr.message }, 500);

      const { data: roleRows } = await adminClient.from("user_roles").select("user_id, role");
      const rolesByUser = new Map<string, string[]>();
      (roleRows ?? []).forEach((r: any) => {
        const arr = rolesByUser.get(r.user_id) ?? [];
        arr.push(r.role);
        rolesByUser.set(r.user_id, arr);
      });

      const users = usersData.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        roles: rolesByUser.get(u.id) ?? [],
      }));

      return jsonResponse({ ok: true, users });
    }

    // ---- DELETE NON-ADMIN USERS ----
    if (action === "delete") {
      if (!body.userId) return jsonResponse({ error: "userId required" }, 400);
      if (body.userId === user.id) return jsonResponse({ error: "Cannot delete yourself" }, 400);

      const { data: targetRoles, error: targetRoleError } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", body.userId);

      if (targetRoleError) return jsonResponse({ error: "Could not verify target user role" }, 500);
      if ((targetRoles ?? []).some((row) => row.role === "admin")) {
        return jsonResponse({ error: "Admin users cannot be deleted" }, 403);
      }

      const { error: delErr } = await adminClient.auth.admin.deleteUser(body.userId);
      if (delErr) return jsonResponse({ error: delErr.message }, 400);
      return jsonResponse({ ok: true });
    }

    // ---- CREATE / INVITE ----
    const email = body.email?.trim().toLowerCase();
    const role = normalizeRole(body.role);

    if (!email || !isValidEmail(email)) return jsonResponse({ error: "A valid email is required" }, 400);
    if (action === "create" && !body.password) return jsonResponse({ error: "Password is required when action is create" }, 400);

    const authResult = action === "create"
      ? await adminClient.auth.admin.createUser({ email, password: body.password, email_confirm: true })
      : await adminClient.auth.admin.inviteUserByEmail(email, { redirectTo: body.redirectTo });

    if (authResult.error || !authResult.data.user) {
      return jsonResponse({ error: authResult.error?.message ?? "Could not create user" }, 400);
    }

    const targetUser = authResult.data.user;
    const { error: roleUpsertError } = await adminClient
      .from("user_roles")
      .upsert({ user_id: targetUser.id, role, created_by: user.id }, { onConflict: "user_id,role" });

    if (roleUpsertError) return jsonResponse({ error: "User created, but role assignment failed" }, 500);

    return jsonResponse({
      ok: true, action,
      user: { id: targetUser.id, email: targetUser.email },
      role,
    });
  } catch (error) {
    console.error("admin-users unhandled error:", error);
    return jsonResponse({ error: "An internal error occurred. Please try again." }, 500);
  }
});
