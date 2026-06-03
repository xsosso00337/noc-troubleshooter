import { useUserRoles } from "./useUserRoles";

export function useIsAdmin() {
  const { isAdmin, loading } = useUserRoles();
  return { isAdmin, loading };
}
