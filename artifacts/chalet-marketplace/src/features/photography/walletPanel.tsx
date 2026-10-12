import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { call, sar, fmtDT, cardCls, ErrorBox } from "./shared";

export interface WalletEntry { id: number; kind: string; amountHalalas: number; description: string; createdAt: string }
export interface OwnerWallet { balanceHalalas: number; entries: WalletEntry[] }
/** Prefix for invalidation; actual cache entries are scoped per authenticated owner. */
export const WALLET_KEY = ["owner-wallet"] as const;
export const walletKey = (ownerId: string | null | undefined) => ["owner-wallet", ownerId ?? "anon"] as const;

/** Authenticated owner user id (null until known). */
export function useOwnerId(): string | null {
  const { user } = useAuth();
  return user?.id ?? null;
}

/** Shared owner wallet (photography + subscription), account-scoped. */
export function useOwnerWallet(enabled = true) {
  const ownerId = useOwnerId();
  return useQuery({ queryKey: walletKey(ownerId), queryFn: () => call<OwnerWallet>("/owner/wallet"), refetchInterval: 30000, enabled: enabled && !!ownerId });
}

export function OwnerWalletPanel({ compact = false }: { compact?: boolean }) {
  const q = useOwnerWallet();
  if (q.isLoading || q.isPending) return <div className="h-24 animate-pulse rounded-2xl bg-muted" aria-busy="true" />;
  if (q.isError || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const { balanceHalalas, entries } = q.data;
  const list = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section className={`${cardCls} space-y-3 border-[#8C6246]/25 bg-gradient-to-l from-[#8C6246]/[0.06] to-transparent`} data-testid="section-owner-wallet">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#8C6246] text-white"><Wallet className="h-5 w-5" aria-hidden /></span>
          <div><p className="text-xs font-semibold text-muted-foreground">رصيد محفظتي</p><p className="text-2xl font-bold tabular-nums" data-testid="text-wallet-balance">{sar(balanceHalalas)}</p></div>
        </div>
        <p className="max-w-xs text-xs text-muted-foreground">رصيد واحد يُستخدم لحجوزات التصوير ولاشتراك المنصة. الدفع من المحفظة يتطلب أن يغطي الرصيد كامل المبلغ.</p>
      </div>
      <details className="group" open={!compact && list.length > 0 && list.length <= 5}>
        <summary className="cursor-pointer text-sm font-semibold text-[#8C6246]" data-testid="toggle-wallet-history">سجل الحركات ({list.length.toLocaleString("ar-SA")})</summary>
        {list.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">لا توجد حركات بعد. تظهر هنا المبالغ المستردة إلى المحفظة والمدفوعات منها.</p> : (
          <ul className="mt-2 divide-y divide-border text-sm">
            {list.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2" data-testid={`row-wallet-entry-${e.id}`}>
                <div className="min-w-0"><p className="truncate font-semibold">{e.description || e.kind}</p><p className="text-xs text-muted-foreground">{fmtDT(e.createdAt)}</p></div>
                <span className={`whitespace-nowrap font-bold tabular-nums ${e.amountHalalas >= 0 ? "text-emerald-700" : "text-destructive"}`} dir="ltr">{e.amountHalalas >= 0 ? "+" : "−"}{sar(Math.abs(e.amountHalalas))}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
