import { useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { supabase } from "./supabase";

export type UserRole = "admin" | "editor" | "viewer";

export function useUserRoles() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (cancelled) return;
        const nextRoles = (data ?? [])
          .map((row) => row.role)
          .filter((role): role is UserRole => role === "admin" || role === "editor" || role === "viewer");
        setRoles(nextRoles);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return {
    roles,
    loading,
    isAdmin: roles.includes("admin"),
    canImport: roles.includes("admin") || roles.includes("editor"),
  };
}
