import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { StaffPermissions } from "./staffPermissions";

export type StaffMember = {
  id: number;
  ownerId: string;
  name: string;
  username: string | null;
  permissions: StaffPermissions;
  baseSalary: string;
  isActive: boolean;
  createdAt: string;
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchStaffMe(): Promise<StaffMember | null> {
  const r = await fetch(`${BASE}/api/staff/me`, { credentials: "include" });
  if (!r.ok) return null;
  const data = await r.json();
  return data.staff ?? null;
}

export function useStaffAuth() {
  const qc = useQueryClient();

  const { data: staffUser = null, isLoading } = useQuery<StaffMember | null>({
    queryKey: ["staff", "me"],
    queryFn: fetchStaffMe,
    staleTime: 60_000,
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch(`${BASE}/api/staff/logout`, { method: "POST", credentials: "include" });
    },
    onSuccess: () => qc.setQueryData(["staff", "me"], null),
  });

  const isStaff = !!staffUser;
  const permissions: StaffPermissions = staffUser?.permissions ?? {};

  return { staffUser, isStaff, permissions, isLoading, logout: logoutMutation.mutate };
}
