import { useEffect, useState } from "react";
import {
  Building2,
  Briefcase,
  Plus,
  MapPin,
  Settings,
  CreditCard,
  ClipboardList,
  AlertCircle,
  RotateCw,
  ChevronLeft,
  Home,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface OwnerHubActivity {
  key: string;
  kind: "chalet" | "service";
  id: number;
  name: string;
  city: string;
  logoUrl: string | null;
  isActive: boolean;
  href: string;
}

export interface OwnerHubProps {
  ownerName: string;
  activities: OwnerHubActivity[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenActivity: (activity: OwnerHubActivity) => void;
  onAddActivity: (kind: "chalet" | "service") => void;
  onAccountSettings: () => void;
  onSubscription: () => void;
  canAddChalet: boolean;
  canAddService: boolean;
  onManageRequests: () => void;
}

function Logo({ a }: { a: OwnerHubActivity }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [a.logoUrl]);
  const Icon = a.kind === "chalet" ? Home : Wrench;
  return (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border bg-secondary flex items-center justify-center text-primary">
      {a.logoUrl && !failed ? (
        <img
          src={a.logoUrl}
          alt={a.name}
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <Icon className="h-7 w-7" aria-hidden />
      )}
    </div>
  );
}

export default function OwnerHub(p: OwnerHubProps) {
  const [open, setOpen] = useState(false);
  const canAny = p.canAddChalet || p.canAddService;

  const choose = (k: "chalet" | "service") => {
    setOpen(false);
    p.onAddActivity(k);
  };

  return (
    <section dir="rtl" className="w-full max-w-full overflow-x-hidden" data-testid="owner-hub">
      <div className="rounded-3xl border border-border bg-gradient-to-l from-accent to-card p-5 sm:p-8">
        <p className="text-sm text-muted-foreground">أهلاً بك</p>
        <h1 className="mt-1 break-words text-2xl font-extrabold sm:text-3xl" data-testid="text-owner-name">
          {p.ownerName}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">اختر النشاط الذي تريد إدارته، أو أضف نشاطاً جديداً.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            onClick={() => setOpen(true)}
            disabled={!canAny}
            className="rounded-full font-bold"
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
          <Button variant="ghost" className="rounded-full" onClick={p.onManageRequests} data-testid="button-manage-requests">
            <ClipboardList /> الطلبات والتقديمات
          </Button>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold">أنشطتي</h2>

      {p.loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="state-loading" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-border bg-secondary" />
          ))}
        </div>
      ) : p.error ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-card p-8 text-center" data-testid="state-error">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm">{p.error}</p>
          <Button variant="outline" onClick={p.onRetry} data-testid="button-retry">
            <RotateCw /> إعادة المحاولة
          </Button>
        </div>
      ) : p.activities.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-10 text-center" data-testid="state-empty">
          <Building2 className="h-10 w-10 text-primary" />
          <p className="font-bold">لا توجد أنشطة بعد</p>
          <p className="text-sm text-muted-foreground">ابدأ بإضافة أول عقار أو خدمة لحسابك.</p>
          {canAny && (
            <Button onClick={() => setOpen(true)} data-testid="button-add-first">
              <Plus /> إضافة نشاط/خدمة جديدة
            </Button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {p.activities.map((a) => (
            <li key={a.key} className="min-w-0">
              <button
                type="button"
                onClick={() => p.onOpenActivity(a)}
                data-testid={`card-activity-${a.key}`}
                className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Logo a={a} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{a.name}</p>
                  <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{a.city}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-semibold ${
                        a.isActive ? "bg-emerald-100 text-emerald-800" : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {a.isActive ? "نشط" : "غير نشط"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      {a.kind === "chalet" ? <Building2 className="h-3 w-3" /> : <Briefcase className="h-3 w-3" />}
                      {a.kind === "chalet" ? "عقار" : "خدمة"}
                    </span>
                  </div>
                </div>
                <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:-translate-x-1" />
              </button>
            </li>
          ))}
        </ul>
      )}

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
