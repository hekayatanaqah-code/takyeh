import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdminStaffPermissions } from "./adminPermissions";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface AdminStaffMember {
  id: number;
  name: string;
  permissions: AdminStaffPermissions;
}

async function fetchAdminStaffMe(): Promise<AdminStaffMember | null> {
  const r = await fetch(`${BASE}/api/admin-staff/me`, { credentials: "include" });
  if (!r.ok) return null;
  const data = await r.json();
  return data.adminStaff ?? null;
}

export function useAdminStaffAuth() {
  const qc = useQueryClient();

  const { data: adminStaffUser = null, isLoading } = useQuery<AdminStaffMember | null>({
    queryKey: ["admin-staff", "me"],
    queryFn: fetchAdminStaffMe,
    staleTime: 60_000,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (creds: { username: string; password: string }) => {
      const r = await fetch(`${BASE}/api/admin-staff/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(creds),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "فشل تسجيل الدخول");
      return data;
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["admin"] });
      for (const key of ["ph-admin", "ph-finance", "ph-transfers"]) qc.removeQueries({ queryKey: [key] });
      void qc.invalidateQueries({ queryKey: ["admin-staff", "me"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch(`${BASE}/api/admin-staff/logout`, {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      // Drop privileged responses before another account can enter this browser.
      qc.removeQueries({ queryKey: ["admin"] });
      for (const key of ["ph-admin", "ph-finance", "ph-transfers"]) qc.removeQueries({ queryKey: [key] });
      qc.setQueryData(["admin-staff", "me"], null);
    },
  });

  return {
    adminStaffUser,
    isAdminStaff: !!adminStaffUser,
    permissions: adminStaffUser?.permissions ?? {},
    isLoading,
    login: loginMutation.mutateAsync,
    loginError: loginMutation.error,
    loginPending: loginMutation.isPending,
    logout: logoutMutation.mutate,
  };
}
