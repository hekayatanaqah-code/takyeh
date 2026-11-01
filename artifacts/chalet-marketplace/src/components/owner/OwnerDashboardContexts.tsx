import { createContext, useContext } from "react";
import { type DashboardActivity } from "@/lib/dashboardActivity";


/* ─── Read-Only mode context (admin impersonation) ──────── */
export const ImpersonationCtx = createContext<{
  isReadOnly: boolean;
  onBlockedEdit: () => void;
}>({ isReadOnly: false, onBlockedEdit: () => {} });

export function useReadOnly() { return useContext(ImpersonationCtx); }

/* ─── Service ERP context — carries selected provider ID ─── */
export const ServiceErpCtx = createContext<{ providerId: number | null }>({ providerId: null });
export function useServiceErp() { return useContext(ServiceErpCtx); }

export type FinanceUnit = DashboardActivity;
export const AdminFinanceCtx = createContext<{ unit: FinanceUnit; selectUnit?: (unit: FinanceUnit) => void; expenseActivities?: FinanceUnit[] }>({ unit: { type: "all" } });
export function useAdminFinance() { return useContext(AdminFinanceCtx); }
