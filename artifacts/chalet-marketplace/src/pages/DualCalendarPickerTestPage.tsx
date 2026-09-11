import { useState } from "react";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { toGregorianStr } from "@/lib/hijri";

export default function DualCalendarPickerTestPage() {
  const [date, setDate] = useState("");
  const minDate = new URLSearchParams(window.location.search).has("minToday")
    ? toGregorianStr(new Date())
    : undefined;

  return (
    <main
      dir="rtl"
      className="min-h-[100dvh] bg-background px-4 pt-[42dvh] text-foreground"
    >
      <div className="mx-auto max-w-sm rounded-2xl border bg-card p-4 shadow-sm">
        <DualCalendarPicker
          value={date}
          onChange={setDate}
          placeholder="اختر تاريخ الاختبار"
          mode="hijri"
          minDate={minDate}
        />
        <output data-testid="selected-date" className="mt-3 block text-sm">
          {date}
        </output>
      </div>
    </main>
  );
}