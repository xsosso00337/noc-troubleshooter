import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminPage } from "./pages/AdminPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ImportPage } from "./pages/ImportPage";
import { LoginPage } from "./pages/LoginPage";
import { NodeLookupPage } from "./pages/NodeLookupPage";
import { PonLookupPage } from "./pages/PonLookupPage";
import { SopPage } from "./pages/SopPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/nodes" element={<NodeLookupPage />} />
          <Route path="/pon" element={<PonLookupPage />} />
          <Route path="/sop/:kind" element={<SopPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
