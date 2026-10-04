import { Building2, Briefcase, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export type OwnerDashboardMode = "chalets" | "services" | "admin-finance";

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
    { mode: "admin-finance" as const, label: "الشؤون المالية", icon: Briefcase, visible: p.canAccessFinance },
  ];

  return (
    <nav
      aria-label="أقسام لوحة تحكم المالك"
      className="contents"
    >
      {items.filter(item => item.visible).map(item => {
        const active = p.mode === item.mode && !p.requestsOpen;
        return (
          <Button
            key={item.mode}
            type="button"
            variant={active ? "default" : "outline"}
            aria-pressed={active}
            className="h-11 min-w-0 gap-1 whitespace-nowrap rounded-xl px-1.5 text-[11px] sm:gap-1.5 sm:px-2 sm:text-xs [&_svg]:size-3.5 sm:[&_svg]:size-4"
            title={item.mode === "admin-finance" ? "الشؤون المالية والإدارية" : item.label}
            onClick={() => p.onSelect(item.mode)}
            data-testid={`owner-nav-${item.mode}`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
            {item.mode === "admin-finance" && p.unreadCount > 0 && (
              <span className="shrink-0 rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground" aria-label={`${p.unreadCount.toLocaleString("ar-SA")} إشعارات غير مقروءة`}>
                {p.unreadCount > 99 ? "٩٩+" : p.unreadCount.toLocaleString("ar-SA")}
              </span>
            )}
          </Button>
        );
      })}
    </nav>
  );
}