import { cn } from "@/lib/utils";

export default function OwnerStatAmount({ amount, className }: { amount: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-baseline gap-x-2 text-[2rem] font-extrabold leading-tight tabular-nums sm:text-4xl", className)}>
      <span className="min-w-0 max-w-full break-all">{amount}</span>
      <span className="shrink-0 whitespace-nowrap text-xl font-bold">ر.س</span>
    </div>
  );
}