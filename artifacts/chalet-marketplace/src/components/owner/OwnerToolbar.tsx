import { useState } from "react";
import {
  Building2,
  Briefcase,
  Plus,
  Settings,
  CreditCard,
  ClipboardList,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface OwnerToolbarProps {
  ownerName: string;
  canAddChalet: boolean;
  canAddService: boolean;
  onAddActivity: (kind: "chalet" | "service") => void;
  onAccountSettings: () => void;
  onSubscription: () => void;
  onManageRequests: () => void;
  onLogout: () => void;
}

export default function OwnerToolbar(p: OwnerToolbarProps) {
  const [open, setOpen] = useState(false);
  const canAny = p.canAddChalet || p.canAddService;

  const choose = (k: "chalet" | "service") => {
    if (k === "chalet" ? !p.canAddChalet : !p.canAddService) return;
    setOpen(false);
    p.onAddActivity(k);
  };

  return (
    <section dir="rtl" className="w-full max-w-full overflow-x-hidden" data-testid="owner-toolbar">
      <div className="rounded-3xl border border-border bg-gradient-to-l from-accent to-card p-4 sm:px-6 sm:py-4">
        <div className="flex items-start justify-between gap-3 lg:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground sm:text-sm">أهلاً بك</p>
            <h1 className="break-words text-xl font-extrabold leading-tight sm:text-2xl" data-testid="text-owner-name">
              {p.ownerName}
            </h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-full text-muted-foreground lg:order-last"
            onClick={p.onLogout}
            aria-label="تسجيل الخروج"
            title="تسجيل الخروج"
            data-testid="button-logout"
          >
            <LogOut />
          </Button>
          <div className="hidden min-w-0 flex-wrap justify-end gap-2 lg:flex">
            <Actions p={p} canAny={canAny} onAdd={() => setOpen(true)} />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:hidden [&>*]:min-w-0 [&>*]:whitespace-normal [&>*]:text-xs sm:[&>*]:text-sm">
          <Actions p={p} canAny={canAny} onAdd={() => setOpen(true)} mobile />
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader className="text-start">
            <DialogTitle>ماذا تريد أن تضيف؟</DialogTitle>
            <DialogDescription>اختر نوع النشاط الجديد.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <button
              type="button"
              disabled={!p.canAddChalet}
              onClick={() => choose("chalet")}
              data-testid="choice-add-chalet"
              className="flex items-center gap-3 rounded-xl border border-border p-4 text-start transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none"
            >
              <Building2 className="h-6 w-6 text-primary" />
              <span className="font-bold">عقار (شاليه / استراحة)</span>
            </button>
            <button
              type="button"
              disabled={!p.canAddService}
              onClick={() => choose("service")}
              data-testid="choice-add-service"
              className="flex items-center gap-3 rounded-xl border border-border p-4 text-start transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none"
            >
              <Briefcase className="h-6 w-6 text-primary" />
              <span className="font-bold">خدمة</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Actions({
  p,
  canAny,
  onAdd,
  mobile,
}: {
  p: OwnerToolbarProps;
  canAny: boolean;
  onAdd: () => void;
  mobile?: boolean;
}) {
  // Test ids only on one rendering (desktop) to stay unique in the DOM.
  const id = (s: string) => (mobile ? `${s}-mobile` : s);
  return (
    <>
      <Button
        onClick={onAdd}
        disabled={!canAny}
        className={`rounded-full font-bold ${mobile ? "col-span-2" : ""}`}
        data-testid={id("button-add-activity")}
      >
        <Plus /> إضافة نشاط/خدمة جديدة
      </Button>
      <Button variant="outline" className="rounded-full" onClick={p.onSubscription} data-testid={id("button-subscription")}>
        <CreditCard /> الاشتراك والباقات
      </Button>
      <Button variant="outline" className="rounded-full" onClick={p.onAccountSettings} data-testid={id("button-account-settings")}>
        <Settings /> الإعدادات الشخصية
      </Button>
      <Button
        variant="ghost"
        className={`rounded-full ${mobile ? "col-span-2" : ""}`}
        onClick={p.onManageRequests}
        data-testid={id("button-manage-requests")}
      >
        <ClipboardList /> طلبات التسجيل
      </Button>
    </>
  );
}
