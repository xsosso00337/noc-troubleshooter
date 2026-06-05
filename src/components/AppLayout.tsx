import { DatabaseZap, KeyRound, LogOut, Menu, Network, RadioTower, Route, ShieldCheck, Users, Wrench, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useUserRoles } from "../lib/useUserRoles";
import { useAuth } from "./AuthProvider";

const baseNav = [
  { to: "/", label: "查修首頁", icon: Wrench },
  { to: "/nodes", label: "光點查詢", icon: Network },
  { to: "/pon", label: "PON 查詢", icon: RadioTower },
  { to: "/sop/optical", label: "光平衡 SOP", icon: Route },
  { to: "/sop/cm-upgrade", label: "CM 升版 SOP", icon: ShieldCheck },
  { to: "/sop/static-ip", label: "固 I SOP", icon: KeyRound },
];

export function AppLayout() {
  const { user } = useAuth();
  const { isAdmin, canImport } = useUserRoles();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navItems = [
    ...baseNav,
    ...(canImport ? [{ to: "/import", label: "資料匯入", icon: DatabaseZap }] : []),
    ...(isAdmin ? [{ to: "/admin", label: "使用者管理", icon: Users }] : []),
  ];

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  async function logout() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  const SideNav = (
    <>
      <div className="brand-block">
        <div className="brand-mark">NOC</div>
        <div>
          <strong>機房查修工具</strong>
          <span>Supabase protected</span>
        </div>
      </div>

      <nav className="nav-list" aria-label="主要功能">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : "")} end={item.to === "/"}>
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="user-box">
        <span>目前登入</span>
        <strong>{user?.email ?? "unknown"}</strong>
        {user?.last_sign_in_at && (
          <span>上次登入：{new Date(user.last_sign_in_at).toLocaleString("zh-TW", { hour12: false })}</span>
        )}
        <button className="icon-button full" onClick={logout}>
          <LogOut size={17} />
          <span>登出</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">{SideNav}</aside>

      <div className="content-shell">
        <header className="mobile-header">
          <button className="icon-button" onClick={() => setDrawerOpen(true)} aria-label="開啟選單">
            <Menu size={18} />
          </button>
          <div>
            <strong>機房查修工具</strong>
            <span>{user?.email}</span>
          </div>
          <button className="icon-button" onClick={logout} aria-label="登出">
            <LogOut size={18} />
          </button>
        </header>
        <Outlet />
      </div>

      {drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <aside className="sidebar mobile-drawer">
            <button className="icon-button drawer-close" onClick={() => setDrawerOpen(false)} aria-label="關閉">
              <X size={18} />
            </button>
            {SideNav}
          </aside>
        </>
      )}
    </div>
  );
}
