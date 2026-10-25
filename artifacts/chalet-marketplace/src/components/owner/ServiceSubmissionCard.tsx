import type { ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle, Briefcase, Clock, Edit2, Loader2, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmissionDate } from "./SubmissionDate";

type Props = {
  submission: {
    id: number;
    businessName: string;
    category: string;
    city?: string | null;
    logoUrl?: string | null;
    galleryPhotos?: string[] | null;
    createdAt?: string | null;
    descriptionAr?: string | null;
    status: string;
    adminNote?: string | null;
  };
  categoryLabel: string;
  status: { label: string; className: string; icon: ReactNode };
  deleting: boolean;
  onDelete: () => void;
};

export function ServiceSubmissionCard({ submission: sub, categoryLabel, status, deleting, onDelete }: Props) {
  const photo = sub.logoUrl || sub.galleryPhotos?.[0];
  const editable = sub.status === "pending" || sub.status === "needs_revision";
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5 lg:p-6" dir="rtl" data-testid={`service-submission-${sub.id}`}>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.25fr)_auto] lg:gap-6">
        <div className="order-2 flex min-w-0 items-start gap-3 lg:order-1">
          {photo ? (
            <img src={photo} alt={sub.businessName} className={`h-20 w-20 shrink-0 rounded-xl border border-border bg-background sm:h-24 sm:w-24 ${sub.logoUrl ? "object-contain p-1" : "object-cover"}`} />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-muted sm:h-24 sm:w-24">
              <Briefcase className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 space-y-1.5">
            <h3 className="break-words text-base font-bold leading-relaxed text-foreground sm:text-lg">{sub.businessName}</h3>
            <p className="text-sm text-muted-foreground">{categoryLabel}</p>
            {sub.city && <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="break-words">{sub.city}</span></p>}
            {sub.descriptionAr && <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{sub.descriptionAr}</p>}
          </div>
        </div>

        <div className="order-3 min-w-0 space-y-3 border-t border-border/60 pt-4 lg:order-2 lg:border-t-0 lg:border-s lg:ps-5 lg:pt-0">
          {sub.createdAt && <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">تاريخ التقديم</p>
            <div className="text-sm text-foreground"><SubmissionDate value={sub.createdAt} inline /></div>
          </div>}
          {editable && <div className="flex items-start gap-2 rounded-xl border border-amber-200/60 bg-amber-50/70 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-300">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <p>يتم تفعيل التقويم والحجوزات تلقائياً بعد اعتماد الخدمة من الإدارة</p>
          </div>}
        </div>

        <aside className="contents lg:order-3 lg:flex lg:min-w-40 lg:flex-col lg:items-end lg:justify-between lg:gap-6" aria-label="حالة الطلب والإجراءات">
          <span className={`order-1 inline-flex items-center gap-1.5 justify-self-end rounded-full px-3 py-1.5 text-xs font-semibold ${status.className}`}>
            {status.icon}{status.label}
          </span>
          <div className="order-4 flex flex-wrap items-center justify-end gap-2 justify-self-end" aria-label="إجراءات الطلب">
            {editable && <Link href={`/add-service-provider?editSubmission=${sub.id}`}>
              <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs">
                <Edit2 className="h-3.5 w-3.5" />تعديل البيانات
              </Button>
            </Link>}
            {sub.status !== "approved" && <Button type="button" size="icon" variant="outline" disabled={deleting} onClick={onDelete}
              title="حذف الطلب" aria-label={`حذف طلب ${sub.businessName}`}
              className="h-8 w-8 shrink-0 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive">
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>}
          </div>
        </aside>
      </div>

      {sub.adminNote && (sub.status === "rejected" || sub.status === "needs_revision") && (
        <div className={`mt-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 ${sub.status === "needs_revision"
          ? "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800/40 dark:bg-orange-950/30 dark:text-orange-300"
          : "border-red-200 bg-red-50 text-red-800 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-300"}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="mb-0.5 text-xs font-bold">{sub.status === "needs_revision" ? "ملاحظات الإدارة — يرجى التعديل والإعادة" : "سبب الرفض"}</p>
            <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">{sub.adminNote}</p>
          </div>
        </div>
      )}
    </article>
  );
}
