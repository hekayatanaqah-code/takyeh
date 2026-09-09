import { useState } from "react";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";

export default function DualCalendarPickerTestPage() {
  const [date, setDate] = useState("");

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
        />
        <output data-testid="selected-date" className="mt-3 block text-sm">
          {date}
        </output>
      </div>
    </main>
  );
}