import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";

interface DualDatePickerProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

export function DualDatePicker({ value, onChange, className = "" }: DualDatePickerProps) {
  return (
    <div className={className}>
      <DualCalendarPicker
        value={value}
        onChange={onChange}
        placeholder="اختر تاريخًا…"
        mode="hijri"
        className="min-h-9 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 hover:border-amber-500/60"
      />
    </div>
  );
}
