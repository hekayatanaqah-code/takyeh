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
  onOwnerServices: () => void;
  ownerServicesOpen?: boolean;
  onLogout: () => void;
  requestsOpen?: boolean;
  activityChoiceOpen?: boolean;
  onActivityChoiceOpenChange?: (open: boolean) => void;
}

export default function OwnerToolbar(p: OwnerToolbarProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = p.activityChoiceOpen ?? localOpen;
  const setOpen = p.onActivityChoiceOpenChange ?? setLocalOpen;
  const canAny = p.canAddChalet || p.canAddService;
  const choiceClassName = "flex items-center gap-3 rounded-xl border border-border p-4 text-start transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out hover:border-primary/40 hover:bg-accent hover:shadow-md motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none";

  const choose = (k: "chalet" | "service") => {
    if (k === "chalet" ? !p.canAddChalet : !p.canAddService) return;
    setOpen(false);
    p.onAddActivity(k);
  };

  return (
    <section dir="rtl" className="w-full max-w-full overflow-x-hidden" data-testid="owner-toolbar">
      <div className="rounded-3xl border border-border bg-gradient-to-l from-accent to-card px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex min-w-0 flex-1 flex-row items-baseline gap-2 text-2xl leading-snug sm:text-3xl" data-testid="text-owner-name">
            <span className="shrink-0 whitespace-nowrap text-base font-normal text-muted-foreground sm:text-lg">أهلاً بك،</span>{" "}
            <bdi className="min-w-0 break-words font-bold text-foreground">{p.ownerName}</bdi>
          </h1>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-full text-muted-foreground"
            onClick={p.onLogout}
            aria-label="تسجيل الخروج"
            title="تسجيل الخروج"
            data-testid="button-logout"
          >
            <LogOut />
          </Button>
        </div>
        <div
          className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
          data-testid="owner-toolbar-actions"
        >
          <Actions p={p} canAny={canAny} onAdd={() => setOpen(true)} />
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
              className={choiceClassName}
            >
              <Building2 className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 space-y-1">
                <span className="block font-bold">عقار (شاليه / استراحة / مزرعة)</span>
                <span className="block text-sm leading-relaxed text-muted-foreground">تأجير وحدة سكنية أو مرفق ترفيهي للمستأجرين</span>
              </span>
            </button>
            <button
              type="button"
              disabled={!p.canAddService}
              onClick={() => choose("service")}
              data-testid="choice-add-service"
              className={choiceClassName}
            >
              <Briefcase className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 space-y-1">
                <span className="block font-bold">خدمة مساندة / إضافية</span>
                <span className="block text-sm leading-relaxed text-muted-foreground">توفير خدمات للحجوزات مثل: الضيافة، العشاء، الصوتيات، والتنظيم</span>
              </span>
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
  const actionClassName = "min-h-12 h-auto min-w-0 gap-2 whitespace-normal rounded-xl px-3 py-3 text-base font-semibold [&_svg]:size-5 [&_svg]:shrink-0";
  return (
    <>
      <Button
        onClick={onAdd}
        disabled={!canAny}
        className={actionClassName}
        data-testid="button-add-activity"
      >
        <Plus /> إضافة نشاط
      </Button>
      <Button variant="outline" className={actionClassName} onClick={p.onSubscription} data-testid="button-subscription">
        <CreditCard /> الاشتراك والباقات
      </Button>
      <Button variant="outline" className={actionClassName} onClick={p.onAccountSettings} data-testid="button-account-settings">
        <Settings /> الإعدادات الشخصية
      </Button>
      <Button
        variant={p.requestsOpen ? "default" : "outline"}
        aria-pressed={!!p.requestsOpen}
        className={actionClassName}
        onClick={p.onManageRequests}
        data-testid="button-manage-requests"
      >
        <ClipboardList /> متابعة الطلبات
      </Button>
      <Button
        variant={p.ownerServicesOpen ? "default" : "outline"}
        aria-pressed={!!p.ownerServicesOpen}
        className={actionClassName}
        onClick={p.onOwnerServices}
        data-testid="owner-nav-owner-services"
      >
        <Briefcase /> خدمات الملاك
      </Button>
    </>
  );
}
