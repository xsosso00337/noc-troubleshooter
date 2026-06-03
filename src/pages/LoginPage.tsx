import { FormEvent, useEffect, useState } from "react";
import { KeyRound, LogIn } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export function LoginPage() {
  const { loading, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/";

  useEffect(() => {
    if (session) navigate(from, { replace: true });
  }, [from, navigate, session]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSubmitting(false);
    if (signInError) {
      setError("登入失敗，請確認帳號、密碼或 Auth 設定。");
      return;
    }

    navigate(from, { replace: true });
  }

  if (!loading && session) return <Navigate to={from} replace />;

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="login-icon">
          <KeyRound size={24} />
        </div>
        <h1>機房查修工具</h1>
        <p>請使用 Supabase Auth email/password 登入後再查看內部資料。</p>

        {!isSupabaseConfigured && (
          <div className="notice danger">
            尚未設定 Supabase URL / publishable key。請先設定 Lovable 或本機環境變數。
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <div className="notice danger">{error}</div>}
          <button className="primary-button" type="submit" disabled={submitting || !isSupabaseConfigured}>
            <LogIn size={18} />
            <span>{submitting ? "登入中..." : "登入"}</span>
          </button>
        </form>
      </section>
    </main>
  );
}
