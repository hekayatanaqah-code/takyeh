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
    { mode: "admin-finance" as const, label: "الشؤون المالية والإدارية", icon: Briefcase, visible: p.canAccessFinance },
  ];

  return (
    <nav aria-label="أقسام لوحة تحكم المالك" className="flex min-w-0 flex-wrap gap-2">
      {items.filter(item => item.visible).map(item => {
        const active = p.mode === item.mode && !p.requestsOpen;
        return (
          <Button
            key={item.mode}
            type="button"
            variant={active ? "default" : "outline"}
            aria-pressed={active}
            className="h-auto min-h-9 max-w-full gap-2 whitespace-normal rounded-full py-2 text-xs sm:text-sm"
            onClick={() => p.onSelect(item.mode)}
            data-testid={`owner-nav-${item.mode}`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
            {item.mode === "admin-finance" && p.unreadCount > 0 && (
              <span className="rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground">
                {p.unreadCount.toLocaleString("ar-SA")}
              </span>
            )}
          </Button>
        );
      })}
    </nav>
  );
}