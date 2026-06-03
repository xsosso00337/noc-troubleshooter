import { FormEvent, useCallback, useEffect, useState } from "react";
import { RefreshCw, UserPlus } from "lucide-react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useIsAdmin } from "../lib/useIsAdmin";

type AdminUser = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  roles: string[];
};

function fmt(dt: string | null) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString("zh-TW", { hour12: false });
  } catch {
    return dt;
  }
}

export function AdminPage() {
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("viewer");
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase.functions.invoke("admin-users", {
      body: { action: "list" },
    });
    setLoading(false);
    if (err || data?.error) {
      setError(err?.message || data?.error || "讀取失敗");
      return;
    }
    setUsers(data.users ?? []);
  }, []);

  useEffect(() => {
    if (isAdmin) void loadUsers();
  }, [isAdmin, loadUsers]);

  if (roleLoading) return <main className="page-stack"><div className="loader-panel">確認權限中…</div></main>;
  if (!isAdmin) return <Navigate to="/" replace />;

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError("");
    const { data, error: err } = await supabase.functions.invoke("admin-users", {
      body: { action: "create", email, password, role },
    });
    setSubmitting(false);
    if (err || data?.error) {
      setError(err?.message || data?.error || "建立失敗");
      return;
    }
    setMessage(`已建立 ${data.user?.email}（${data.role}）`);
    setEmail("");
    setPassword("");
    setRole("viewer");
    void loadUsers();
  }

  return (
    <main className="page-stack">
      <section className="page-title">
        <span>Admin</span>
        <h1>使用者管理</h1>
        <p>建立與查看帳號；顯示每位使用者的最後登入時間。</p>
      </section>

      <section className="panel">
        <h2>建立新帳號</h2>
        <form className="form-grid four" onSubmit={createUser}>
          <label>Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
          </label>
          <label>初始密碼
            <input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 碼" />
          </label>
          <label>角色
            <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option value="viewer">viewer（一般查詢）</option>
              <option value="editor">editor（可匯入）</option>
              <option value="admin">admin（管理員）</option>
            </select>
          </label>
          <label style={{ alignSelf: "end" }}>
            <span style={{ visibility: "hidden" }}>送出</span>
            <button className="primary-button" type="submit" disabled={submitting}>
              <UserPlus size={17} />
              <span>{submitting ? "建立中…" : "建立帳號"}</span>
            </button>
          </label>
        </form>
        {message && <div className="notice" style={{ marginTop: 12, background: "#edf8f1", border: "1px solid #b9e3c7", color: "#16743f" }}>{message}</div>}
        {error && <div className="notice danger" style={{ marginTop: 12 }}>{error}</div>}
      </section>

      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <h2 style={{ margin: 0 }}>使用者列表（{users.length}）</h2>
          <button className="ghost-button" onClick={() => void loadUsers()} disabled={loading}>
            <RefreshCw size={16} />
            <span>{loading ? "讀取中…" : "重新整理"}</span>
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="field-table wide" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Email</th>
                <th>角色</th>
                <th>最後登入</th>
                <th>建立時間</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ wordBreak: "break-all" }}>
                    {u.email}
                    {!u.email_confirmed_at && <span className="pill warn-pill" style={{ marginLeft: 6 }}>未驗證</span>}
                  </td>
                  <td>{u.roles.length ? u.roles.join(", ") : "—"}</td>
                  <td>{fmt(u.last_sign_in_at)}</td>
                  <td>{fmt(u.created_at)}</td>
                </tr>
              ))}
              {!users.length && !loading && (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--muted)" }}>尚無資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
