import { FormEvent, useCallback, useEffect, useState } from "react";
import { RefreshCw, Trash2, UserPlus, Users2 } from "lucide-react";
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

type Role = "admin" | "editor" | "viewer";

function fmt(dt: string | null) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString("zh-TW", { hour12: false });
  } catch {
    return dt;
  }
}

function relTime(dt: string | null) {
  if (!dt) return "從未登入";
  const diff = Date.now() - new Date(dt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "剛剛";
  if (mins < 60) return `${mins} 分鐘前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小時前`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 個月前`;
  return `${Math.floor(months / 12)} 年前`;
}

function isProtectedAdmin(user: AdminUser) {
  return user.roles.includes("admin");
}

function RoleBadge({ role }: { role: string }) {
  const cls =
    role === "admin" ? "role-badge admin" : role === "editor" ? "role-badge editor" : "role-badge viewer";
  return <span className={cls}>{role}</span>;
}

export function AdminPage() {
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [submitting, setSubmitting] = useState(false);

  const [batchEmails, setBatchEmails] = useState("");
  const [batchRole, setBatchRole] = useState<Role>("viewer");
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchReport, setBatchReport] = useState<Array<{ email: string; ok: boolean; error?: string }>>([]);

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

  async function batchInvite(event: FormEvent) {
    event.preventDefault();
    setBatchSubmitting(true);
    setBatchReport([]);
    setError("");
    setMessage("");
    const emails = batchEmails
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!emails.length) {
      setError("請至少輸入一個 email。");
      setBatchSubmitting(false);
      return;
    }
    const { data, error: err } = await supabase.functions.invoke("admin-users", {
      body: { action: "batch-invite", emails, role: batchRole },
    });
    setBatchSubmitting(false);
    if (err || data?.error) {
      setError(err?.message || data?.error || "批次邀請失敗");
      return;
    }
    const results = (data.results ?? []) as Array<{ email: string; ok: boolean; error?: string }>;
    setBatchReport(results);
    const ok = results.filter((r) => r.ok).length;
    setMessage(`批次邀請完成：成功 ${ok} / 失敗 ${results.length - ok}`);
    setBatchEmails("");
    void loadUsers();
  }

  async function removeUser(target: AdminUser) {
    if (isProtectedAdmin(target)) {
      setError("admin 帳號受保護，不能刪除。");
      return;
    }

    if (!confirm(`確定刪除 ${target.email}？此操作會同時刪除 Auth 帳號與角色。`)) return;

    setError("");
    setMessage("");
    const { data, error: err } = await supabase.functions.invoke("admin-users", {
      body: { action: "delete", userId: target.id },
    });

    if (err || data?.error) {
      setError(err?.message || data?.error || "刪除失敗");
      return;
    }

    setMessage(`已刪除 ${target.email}`);
    void loadUsers();
  }

  return (
    <main className="page-stack">
      <section className="page-title">
        <span>Admin</span>
        <h1>使用者管理</h1>
        <p>建立、查看與刪除一般帳號；admin 帳號受保護不能刪除。</p>
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
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
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
      </section>

      <section className="panel">
        <h2>批次邀請</h2>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>一次貼上多個 email（以逗號、空白或換行分隔），系統會寄出邀請信並指派角色。</p>
        <form onSubmit={batchInvite} style={{ display: "grid", gap: 12 }}>
          <label>Email 清單
            <textarea
              value={batchEmails}
              onChange={(e) => setBatchEmails(e.target.value)}
              placeholder={"user1@example.com\nuser2@example.com"}
              rows={5}
              style={{ minHeight: 120 }}
            />
          </label>
          <div className="form-grid two">
            <label>預設角色
              <select value={batchRole} onChange={(e) => setBatchRole(e.target.value as Role)}>
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <label style={{ alignSelf: "end" }}>
              <span style={{ visibility: "hidden" }}>送出</span>
              <button className="primary-button" type="submit" disabled={batchSubmitting}>
                <Users2 size={17} />
                <span>{batchSubmitting ? "邀請中…" : "送出批次邀請"}</span>
              </button>
            </label>
          </div>
        </form>
        {!!batchReport.length && (
          <div style={{ marginTop: 12 }}>
            <table className="field-table wide">
              <thead><tr><th>Email</th><th>結果</th></tr></thead>
              <tbody>
                {batchReport.map((r) => (
                  <tr key={r.email}>
                    <td>{r.email}</td>
                    <td>{r.ok ? <span className="pill" style={{ background: "#edf8f1", color: "#16743f" }}>成功</span> : <span className="pill warn-pill">{r.error ?? "失敗"}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {message && <div className="notice" style={{ background: "#edf8f1", border: "1px solid #b9e3c7", color: "#16743f" }}>{message}</div>}
      {error && <div className="notice danger">{error}</div>}

      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <h2 style={{ margin: 0 }}>使用者列表（{users.length}）</h2>
          <button className="ghost-button" onClick={() => void loadUsers()} disabled={loading}>
            <RefreshCw size={16} />
            <span>{loading ? "讀取中…" : "重新整理"}</span>
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="field-table wide" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>Email</th>
                <th>角色</th>
                <th>最後登入</th>
                <th>建立時間</th>
                <th>動作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ wordBreak: "break-all" }}>
                    {u.email}
                    {!u.email_confirmed_at && <span className="pill warn-pill" style={{ marginLeft: 6 }}>未驗證</span>}
                  </td>
                  <td>
                    {u.roles.length
                      ? <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>{u.roles.map((r) => <RoleBadge key={r} role={r} />)}</span>
                      : "—"}
                  </td>
                  <td>
                    <div>{fmt(u.last_sign_in_at)}</div>
                    <small style={{ color: "var(--muted)" }}>{relTime(u.last_sign_in_at)}</small>
                  </td>
                  <td>{fmt(u.created_at)}</td>
                  <td>
                    {isProtectedAdmin(u) ? (
                      <span className="pill muted-pill">受保護</span>
                    ) : (
                      <button className="ghost-button" onClick={() => void removeUser(u)} aria-label="刪除">
                        <Trash2 size={15} />
                        <span>刪除</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!users.length && !loading && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)" }}>尚無資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
