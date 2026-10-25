import { Calendar } from "lucide-react";
import { submissionDualDate } from "@/lib/submissionDate";

export function SubmissionDate({ value, inline = false }: { value: string | null | undefined; inline?: boolean }) {
  const dates = submissionDualDate(value);
  if (!dates) return null;
  return (
    <span className="inline-flex min-w-0 items-start gap-1.5" aria-label="تاريخ تقديم الطلب" data-testid="submission-dual-date">
      <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <time dateTime={value!} className={`flex min-w-0 text-right leading-relaxed ${inline ? "flex-row flex-wrap items-baseline gap-x-2 gap-y-0.5" : "flex-col gap-0.5"}`} dir="rtl">
        <span>{dates.hijri}</span>
        {inline && <span aria-hidden="true" className="text-muted-foreground/50">/</span>}
        <span className={inline ? "text-muted-foreground" : "text-xs text-muted-foreground"}>{dates.gregorian}</span>
      </time>
    </span>
  );
}
