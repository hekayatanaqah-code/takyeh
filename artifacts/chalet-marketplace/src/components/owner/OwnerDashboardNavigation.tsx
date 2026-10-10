import { Building2, Briefcase, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export type OwnerDashboardMode = "chalets" | "services" | "admin-finance" | "owner-services";

interface Props {
  mode: OwnerDashboardMode;
  requestsOpen: boolean;
  canSeeChalets: boolean;
  canSeeServices: boolean;
  canAccessFinance: boolean;
  unreadCount: number;
  onSelect: (mode: OwnerDashboardMode) => void;
}

export default function OwnerDashboardNavigation(p: Props) {
  const items = [
    { mode: "chalets" as const, label: "إدارة عقاراتي", icon: Building2, visible: p.canSeeChalets },
    { mode: "services" as const, label: "إدارة خدماتي", icon: Star, visible: p.canSeeServices },
    { mode: "admin-finance" as const, label: "الشؤون الإدارية والمالية", icon: Briefcase, visible: p.canAccessFinance },
  ];

  if (!items.some(item => item.visible)) return null;
  return (
    <nav
      aria-label="الأقسام التشغيلية للمالك"
      className="mt-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none"
      data-testid="owner-primary-navigation"
    >
      {items.filter(item => item.visible).map(item => {
        const active = p.mode === item.mode && !p.requestsOpen;
        return (
          <Button
            key={item.mode}
            type="button"
            variant={active ? "default" : "outline"}
            aria-pressed={active}
            className={`h-auto min-h-20 min-w-0 justify-start gap-3 whitespace-normal rounded-2xl border-2 px-5 py-4 text-start text-lg font-bold shadow-sm transition-colors [&_svg]:size-6 ${
              active ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25 ring-2 ring-primary/30 hover:bg-primary/90" : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent"
            }`}
            title={item.label}
            onClick={() => p.onSelect(item.mode)}
            data-testid={`owner-nav-${item.mode}`}
          >
            <item.icon className="h-6 w-6 shrink-0" />
            {item.label}
            {item.mode === "admin-finance" && p.unreadCount > 0 && (
              <span className="ms-auto shrink-0 rounded-full bg-destructive px-2 text-sm text-destructive-foreground" aria-label={`${p.unreadCount.toLocaleString("ar-SA")} إشعارات غير مقروءة`}>
                {p.unreadCount > 99 ? "٩٩+" : p.unreadCount.toLocaleString("ar-SA")}
              </span>
            )}
          </Button>
        );
      })}
    </nav>
  );
}