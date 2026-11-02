import { ServiceCatalogPanel, ServiceOffersPanel } from "@/components/owner/ServiceCatalogPanels";
import { QuickSalesPanel } from "@/components/owner/QuickSalesPanel";
import { hasServiceInsurance } from "@/lib/serviceDashboardTabs";
import { AdminFinanceCtx, useReadOnly } from "@/components/owner/OwnerDashboardContexts";
import { ServiceDetailsTab } from "@/components/owner/ServiceDetailsTab";
import { ServiceSeasonsTab } from "@/components/owner/ServiceSeasonsTab";
import { ServiceCalendarBookingsTab } from "@/components/owner/ServiceCalendarBookingsTab";
import { ServiceBookingInsurancesTab } from "@/components/owner/ServiceInsuranceTabs";
import { ServiceDigitalContractsTab } from "@/components/owner/ServiceDigitalContractsTab";
import { ServiceReviewsTab } from "@/components/owner/ReviewsTabs";
import { CustomersTab } from "@/components/owner/CustomersTab";
import { OwnerMessageSettingsTab } from "@/components/owner/OwnerMessageSettingsTab";
import { SectionGuideButton } from "./SectionGuideButton";
import { SERVICE_TAB_GUIDE_KEYS } from "@/lib/sectionGuideCatalog";

type Props = {
  provider: { id: number; businessName: string; requiresInsurance: boolean; insuranceAmount: string | null; requiresContract: boolean };
  tab: string;
  calendarPreference: "hijri" | "gregorian";
};

export function ServiceManagementContent(props: Props) {
  const guide = SERVICE_TAB_GUIDE_KEYS[props.tab];
  const embeddedGuide = ["customers", "messages", "digitalContracts"].includes(props.tab);
  return <div className="min-w-0 space-y-4">
    {guide && !embeddedGuide && <SectionGuideButton sectionKey={guide} activity="service" />}
    <SelectedServiceContent {...props} />
  </div>;
}

function SelectedServiceContent({ provider, tab, calendarPreference }: Props) {
  const { isReadOnly } = useReadOnly();
  if (tab === "details") return <ServiceDetailsTab />;
  if (tab === "catalog") return <ServiceCatalogPanel providerId={provider.id} readOnly={isReadOnly} />;
  if (tab === "quickSales") return <QuickSalesPanel key={provider.id} providerId={provider.id} readOnly={isReadOnly} />;
  if (tab === "offers") return <ServiceOffersPanel providerId={provider.id} readOnly={isReadOnly} />;
  if (tab === "seasons") return <ServiceSeasonsTab />;
  if (tab === "calendar") return <ServiceCalendarBookingsTab />;
  if (tab === "insurance" && hasServiceInsurance(provider)) return <ServiceBookingInsurancesTab />;
  if (tab === "digitalContracts" && provider.requiresContract) return <ServiceDigitalContractsTab />;
  if (tab === "reviews") return <ServiceReviewsTab />;
  if (tab === "customers") return <AdminFinanceCtx.Provider value={{ unit: { type: "service", id: provider.id, name: provider.businessName } }}>
    <CustomersTab key={provider.id} calendarPreference={calendarPreference} />
  </AdminFinanceCtx.Provider>;
  if (tab === "messages") return <OwnerMessageSettingsTab establishmentName={provider.businessName} providerId={provider.id} />;
  return null;
}
