import { useState } from "react";
import { Clock } from "lucide-react";
import { arabicTimeTo24h, time24hToArabic, toAr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function parts(value: string) {
  const time = arabicTimeTo24h(value);
  const [hours, minutes] = (time || "00:00").split(":").map(Number);
  return { hour: hours % 12 || 12, minute: minutes, period: hours < 12 ? "am" : "pm" };
}

export default function PropertyTimePicker({ value, onChange, label }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => parts(value));
  const selected = arabicTimeTo24h(value);
  const current = parts(value);
  const display = selected
    ? `${toAr(current.hour)}:${toAr(String(current.minute).padStart(2, "0"))} ${current.period === "am" ? "صباحاً" : "مساءً"}`
    : value || "اختر الوقت";
  const choiceClass = "h-11 rounded-lg text-sm transition-colors";
  const apply = () => {
    const hour24 = draft.hour % 12 + (draft.period === "pm" ? 12 : 0);
    onChange(time24hToArabic(`${String(hour24).padStart(2, "0")}:${String(draft.minute).padStart(2, "0")}`));
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={next => { if (next) setDraft(parts(value)); setOpen(next); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-auto min-h-10 w-full justify-between gap-1 px-2 text-xs font-normal" dir="rtl" aria-label={label}>
          <span className="whitespace-normal">{display}</span>
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" aria-label={label} align="center" collisionPadding={12} className="w-72 max-w-[calc(100vw-24px)] space-y-3 rounded-2xl p-4">
        <p className="text-sm font-semibold">{label}</p>
        <div role="group" aria-label="الساعة" className="space-y-1.5">
          <p className="text-xs text-muted-foreground">الساعة</p>
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: 12 }, (_, index) => index + 1).map(hour => (
              <Button key={hour} type="button" variant={draft.hour === hour ? "default" : "outline"} aria-pressed={draft.hour === hour}
                aria-label={`الساعة ${toAr(hour)}`} className={choiceClass} onClick={() => setDraft(previous => ({ ...previous, hour }))}>
                {toAr(hour)}
              </Button>
            ))}
          </div>
        </div>
        <div role="group" aria-label="الدقائق" className="grid grid-cols-2 gap-1.5">
          {[0, 30].map(minute => (
            <Button key={minute} type="button" variant={draft.minute === minute ? "default" : "outline"} aria-pressed={draft.minute === minute}
              aria-label={minute === 0 ? "على رأس الساعة" : "النصف"} className={choiceClass} onClick={() => setDraft(previous => ({ ...previous, minute }))}>
              {minute === 0 ? "٠٠ دقيقة" : "٣٠ دقيقة"}
            </Button>
          ))}
        </div>
        <div role="group" aria-label="الفترة" className="grid grid-cols-2 gap-1.5">
          {[{ value: "am", title: "صباحاً" }, { value: "pm", title: "مساءً" }].map(period => (
            <Button key={period.value} type="button" variant={draft.period === period.value ? "default" : "outline"}
              aria-pressed={draft.period === period.value} className={choiceClass} onClick={() => setDraft(previous => ({ ...previous, period: period.value }))}>
              {period.title}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 border-t pt-3">
          <Button type="button" className="h-11 flex-1 rounded-lg" disabled={draft.minute !== 0 && draft.minute !== 30} onClick={apply}>تأكيد الوقت</Button>
          <Button type="button" variant="ghost" className="h-11 rounded-lg" onClick={() => { onChange(""); setOpen(false); }}>مسح</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
