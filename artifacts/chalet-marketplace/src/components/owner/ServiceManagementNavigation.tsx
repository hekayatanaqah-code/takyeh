import { Calendar, Edit2, Package, ScrollText, Send, Shield, Star, Sunrise, Tag, UserCheck } from "lucide-react";
import OwnerSubnav from "./OwnerSubnav";
import { serviceDashboardTabs, type ServiceCapabilities } from "@/lib/serviceDashboardTabs";

const icons = { details: Edit2, catalog: Package, seasons: Sunrise, offers: Tag, reviews: Star, calendar: Calendar, customers: UserCheck, messages: Send, insurance: Shield, digitalContracts: ScrollText };
export function ServiceManagementNavigation({ providers, value, onChange }: {
  providers: ServiceCapabilities[]; value: string; onChange: (value: string) => void;
}) {
  return <OwnerSubnav highContrast label="تبويبات إدارة الخدمة" className="gap-x-1 gap-y-2 pb-2 px-1">
    {serviceDashboardTabs(providers).map(tab => {
      const Icon = icons[tab.id as keyof typeof icons];
      return <button key={tab.id} type="button" data-testid={`service-tab-${tab.id}`}
        onClick={() => onChange(tab.id)} aria-pressed={value === tab.id}
        className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${value === tab.id ? "border-primary bg-primary/10 text-foreground" : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{tab.label}
      </button>;
    })}
  </OwnerSubnav>;
}
