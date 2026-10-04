import { useState, type ReactNode } from "react";
import { Link } from "wouter";
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
  navigation?: ReactNode;
  showHomeLink?: boolean;
  requestsOpen?: boolean;
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
        <div className="flex flex-wrap items-start gap-3 lg:items-center">
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
          <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto lg:min-w-0 lg:flex-wrap lg:justify-end [&>*]:min-w-0 [&>*]:whitespace-normal [&>*]:text-xs sm:[&>*]:text-sm">
            <Actions p={p} canAny={canAny} onAdd={() => setOpen(true)} />
          </div>
        </div>
        {(p.navigation || p.showHomeLink) && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
            {p.navigation}
            {p.showHomeLink && (
              <Link href="/" className="text-xs font-semibold text-muted-foreground hover:text-primary">
                الرئيسية · تصفح المنصة
              </Link>
            )}
          </div>
        )}
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
}: {
  p: OwnerToolbarProps;
  canAny: boolean;
  onAdd: () => void;
}) {
  return (
    <>
      <Button
        onClick={onAdd}
        disabled={!canAny}
        className="col-span-2 rounded-full font-bold lg:col-span-1"
        data-testid="button-add-activity"
      >
        <Plus /> إضافة نشاط/خدمة جديدة
      </Button>
      <Button variant="outline" className="rounded-full" onClick={p.onSubscription} data-testid="button-subscription">
        <CreditCard /> الاشتراك والباقات
      </Button>
      <Button variant="outline" className="rounded-full" onClick={p.onAccountSettings} data-testid="button-account-settings">
        <Settings /> الإعدادات الشخصية
      </Button>
      <Button
        variant={p.requestsOpen ? "default" : "outline"}
        aria-pressed={!!p.requestsOpen}
        className="col-span-2 rounded-full lg:col-span-1"
        onClick={p.onManageRequests}
        data-testid="button-manage-requests"
      >
        <ClipboardList /> متابعة الطلبات
      </Button>
    </>
  );
}
