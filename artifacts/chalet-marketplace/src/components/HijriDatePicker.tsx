import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";

/* ── Component ── */

export interface HijriDatePickerProps {
  /** Gregorian date string "YYYY-MM-DD" or "" */
  value: string;
  /** Called with Gregorian "YYYY-MM-DD" string on selection */
  onChange: (gregorian: string) => void;
  className?: string;
  placeholder?: string;
}

export function HijriDatePicker({
  value,
  onChange,
  className = "",
  placeholder = "اختر تاريخاً",
}: HijriDatePickerProps) {
  return (
    <div className={className} dir="rtl">
      <DualCalendarPicker
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        mode="hijri"
        className="min-h-9 rounded-lg border border-border bg-background px-2.5 py-1.5 hover:border-teal-400/70"
      />
    </div>
  );
}
