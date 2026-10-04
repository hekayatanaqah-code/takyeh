import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function OwnerSubnav({ children, className, label, highContrast = false }: { children: ReactNode; className?: string; label: string; highContrast?: boolean }) {
  return (
    <nav
      dir="rtl"
      aria-label={label}
      className={cn(
        "flex min-w-0 max-w-full flex-nowrap overflow-x-auto overscroll-x-contain scroll-smooth motion-reduce:scroll-auto sm:flex-wrap [scrollbar-width:thin] [-webkit-overflow-scrolling:touch] [&>button]:shrink-0 rounded-t-xl bg-primary/5 border-b border-primary/30",
        highContrast && "bg-gray-100 dark:bg-slate-900 border-gray-200 dark:border-slate-700",
        className,
      )}
    >
      {children}
    </nav>
  );
}