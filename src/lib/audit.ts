import { supabase } from "./supabase";

export async function writeAuditLog(
  action: string,
  filters: Record<string, unknown>,
  metadata: Record<string, unknown> = {},
) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;

  await supabase.from("audit_logs").insert({
    action,
    filters,
    metadata,
  });
}
