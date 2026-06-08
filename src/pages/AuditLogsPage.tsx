import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ScrollText } from "lucide-react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useIsAdmin } from "../lib/useIsAdmin";

type AuditRow = {
  id: string;
  user_id: string;
  action: string;
  filters: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
};

type UserEmailMap = Record<string, string | null>;

function fmt(dt: string) {
  try {
    return new Date(dt).toLocaleString("zh-TW", { hour12: false });
  } catch {
    return dt;
  }
}

function shortJson(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    const text = JSON.stringify(value);
    return text.length > 120 ? text.slice(0, 117) + "…" : text;
  } catch {
    return String(value);
  }
}

export function AuditLogsPage() {
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [emails, setEmails] = useState<UserEmailMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let q = supabase
      .from("audit_logs")
      .select("id,user_id,action,filters,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (actionFilter) q = q.eq("action", actionFilter);
    const { data, error: err } = await q;
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const logs = (data ?? []) as AuditRow[];
    setRows(logs);

    // Resolve emails via admin-users list (admin-only)
    const { data: usersResp } = await supabase.functions.invoke("admin-users", { body: { action: "list" } });
    const map: UserEmailMap = {};
    (usersResp?.users ?? []).forEach((u: { id: string; email: string | null }) => {
      map[u.id] = u.email;
    });
    setEmails(map);
    setLoading(false);
  }, [actionFilter]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (roleLoading) return <main className="page-stack"><div className="loader-panel">確認權限中…</div></main>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const actions = Array.from(new Set(rows.map((r) => r.action))).sort();

  return (
    <main className="page-stack">
      <section className="page-title">
        <span>Audit</span>
        <h1>稽核日誌</h1>
        <p>顯示登入後的查詢與 SOP 載入紀錄，最多 300 筆。</p>
      </section>

      <section className="panel">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <ScrollText size={18} />
          <strong style={{ marginRight: "auto" }}>共 {rows.length} 筆</strong>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={{ maxWidth: 240 }}>
            <option value="">全部動作</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="ghost-button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} />
            <span>{loading ? "讀取中…" : "重新整理"}</span>
          </button>
        </div>
        {error && <div className="notice danger" style={{ marginBottom: 10 }}>{error}</div>}
        <div style={{ overflowX: "auto" }}>
          <table className="field-table wide" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>時間</th>
                <th>使用者</th>
                <th>動作</th>
                <th>查詢條件</th>
                <th>結果</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmt(r.created_at)}</td>
                  <td style={{ wordBreak: "break-all" }}>{emails[r.user_id] ?? r.user_id.slice(0, 8)}</td>
                  <td><span className="pill">{r.action}</span></td>
                  <td><code style={{ fontSize: 12 }}>{shortJson(r.filters)}</code></td>
                  <td><code style={{ fontSize: 12 }}>{shortJson(r.metadata)}</code></td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)" }}>尚無紀錄</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
