import { Button } from "@/components/ui/button";
import { archivePageNumbers } from "@/lib/bookingArchive";
import { toAr } from "@/lib/utils";

export default function BookingArchivePagination({ page, total, loading, onChange }: {
  page: number; total: number; loading: boolean; onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / 10));
  if (!total) return null;
  return (
    <nav aria-label="صفحات الأرشيف" className="px-4 pb-4 border-t border-border pt-3 space-y-2" dir="rtl">
      <p className="text-xs text-muted-foreground text-center">
        عرض {toAr((page - 1) * 10 + 1)}–{toAr(Math.min(page * 10, total))} من {toAr(total)} · ١٠ حجوزات لكل صفحة
      </p>
      <div className="flex flex-wrap justify-center items-center gap-1">
        <Button type="button" variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => onChange(page - 1)}>السابق</Button>
        {archivePageNumbers(page, totalPages).map((number, index) => number === "gap" ? (
          <span key={`gap-${index}`} className="px-1" aria-hidden="true">…</span>
        ) : (
          <Button type="button" key={number} size="sm" variant={number === page ? "default" : "outline"}
            aria-label={`الصفحة ${number}`} aria-current={number === page ? "page" : undefined}
            disabled={loading} onClick={() => onChange(number)} className="min-w-8">
            {toAr(number)}
          </Button>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={loading || page >= totalPages} onClick={() => onChange(page + 1)}>التالي</Button>
      </div>
    </nav>
  );
}
