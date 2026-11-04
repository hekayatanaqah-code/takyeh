import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./owner-api";
import { financialSelectionKey, mergeFinancialTransactions, type FinancialSelection } from "@/lib/financialSelection";
import type { FinancialTransaction } from "@/lib/transactionHistory";

export function useFinancialTransactions(selection: FinancialSelection) {
  return useQuery<FinancialTransaction[]>({
    queryKey: ["owner", "transaction-history", "selection", financialSelectionKey(selection)],
    placeholderData: undefined,
    queryFn: async () => {
      const scopes = selection === null ? [null] : selection;
      const responses = await Promise.all(scopes.map(async activity => {
        const params = new URLSearchParams();
        if (activity?.type === "chalet") {
          if (!activity.submissionId) throw new Error("تعذّر تحديد العقار");
          params.set("submissionId", String(activity.submissionId));
        } else if (activity) params.set("providerId", String(activity.id));
        const response = await apiFetch(`/owner/transaction-history?${params}`);
        if (!response.ok) throw new Error("تعذّر تحميل المعاملات المالية للأنشطة المختارة");
        return response.json() as Promise<FinancialTransaction[]>;
      }));
      return mergeFinancialTransactions(responses);
    },
    staleTime: 0, refetchOnMount: "always", refetchInterval: 30_000,
  });
}
