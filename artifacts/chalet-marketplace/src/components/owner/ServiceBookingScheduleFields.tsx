import { useId, type ReactNode } from "react";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { time24hToArabic } from "../../lib/utils";

export interface ServiceBookingScheduleFieldsProps {
  editing: boolean;
  time: string;
  onTimeChange: (value: string) => void;
  reasonType: string;
  reason: string;
  onReasonTypeChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  children: ReactNode;
}

/** The same scheduling fields are used by all service create/edit entry points. */
export function ServiceBookingScheduleFields({
  editing, time, onTimeChange, reasonType, reason, onReasonTypeChange, onReasonChange, children,
}: ServiceBookingScheduleFieldsProps) {
  const id = useId();
  return (
    <fieldset className="min-w-0 md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3"
      data-testid="service-booking-schedule-section">
      <legend className="px-1 text-xs font-bold text-primary">
        {editing ? "موعد الحجز وسبب التعديل" : "موعد الحجز"}
      </legend>
      <div className="min-w-0 space-y-1.5 sm:col-span-2">
        <p className="text-xs font-semibold text-muted-foreground">تاريخ الخدمة *</p>
        {children}
      </div>
      <div className="min-w-0 space-y-1.5">
        <label htmlFor={`${id}-time`} className="block text-xs font-semibold text-muted-foreground">الوقت</label>
        <Input id={`${id}-time`} type="time" step={60} dir="ltr" value={time}
          onChange={event => onTimeChange(event.target.value)}
          aria-describedby={`${id}-time-hint`}
          data-testid="service-booking-time"
          className="w-full min-w-0 rounded-xl bg-background" />
        <p id={`${id}-time-hint`} className="text-[11px] text-muted-foreground">
          اختياري — بتوقيت السعودية
          {time && <span className="block font-semibold text-foreground">{time24hToArabic(time)}</span>}
        </p>
      </div>
      {editing && (
        <div className="min-w-0 space-y-2">
          <label htmlFor={`${id}-reason`} className="block text-xs font-semibold text-muted-foreground">سبب التعديل / إعادة الجدولة *</label>
          <Select value={reasonType} onValueChange={onReasonTypeChange}>
            <SelectTrigger id={`${id}-reason`} className="w-full min-w-0 rounded-xl bg-background">
              <SelectValue placeholder="اختر سبب التعديل" />
            </SelectTrigger>
            <SelectContent>
              {["طلب العميل", "تعديل تاريخ الحجز", "تعديل وقت الحجز", "تعديل مدة الحجز", "ظروف طارئة", "صيانة", "أخرى"].map(value =>
                <SelectItem key={value} value={value}>{value}</SelectItem>)}
            </SelectContent>
          </Select>
          {reasonType === "أخرى" && (
            <Textarea aria-label="اكتب سبب التعديل" value={reason} rows={2}
              onChange={event => onReasonChange(event.target.value)}
              className="rounded-xl resize-none bg-background"
              placeholder="اكتب سبب التعديل أو إعادة الجدولة..." />
          )}
        </div>
      )}
    </fieldset>
  );
}
