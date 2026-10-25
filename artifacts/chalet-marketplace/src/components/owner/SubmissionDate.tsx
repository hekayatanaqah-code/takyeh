import { Calendar } from "lucide-react";
import { submissionDualDate } from "@/lib/submissionDate";

export function SubmissionDate({ value }: { value: string | null | undefined }) {
  const dates = submissionDualDate(value);
  if (!dates) return null;
  return (
    <span className="inline-flex min-w-0 items-start gap-1.5" aria-label="تاريخ تقديم الطلب" data-testid="submission-dual-date">
      <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <time dateTime={value!} className="flex min-w-0 flex-col gap-0.5 text-right leading-relaxed" dir="rtl">
        <span>{dates.hijri}</span>
        <span className="text-xs text-muted-foreground">{dates.gregorian}</span>
      </time>
    </span>
  );
}
