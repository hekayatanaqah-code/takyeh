import { arabicTimeTo24h, time24hToArabic, toAr } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const times = Array.from({ length: 48 }, (_, index) =>
  `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
);

function label(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return `${toAr(String(hours % 12 || 12))}:${toAr(String(minutes).padStart(2, "0"))} ${hours < 12 ? "صباحاً" : "مساءً"}`;
}

export default function PropertyTimeSelect({ value, onChange, label: ariaLabel }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const selected = arabicTimeTo24h(value);
  // Preserve a previously saved off-grid time until the owner explicitly changes it.
  const legacy = selected && !times.includes(selected);
  return (
    <Select value={selected || "__none__"} onValueChange={time => onChange(time === "__none__" ? "" : time24hToArabic(time))}>
      <SelectTrigger className="h-9 text-xs" dir="rtl" aria-label={ariaLabel}>
        <SelectValue placeholder="اختر الوقت" />
      </SelectTrigger>
      <SelectContent dir="rtl">
        <SelectItem value="__none__">اختر الوقت</SelectItem>
        {legacy && <SelectItem value={selected}>{label(selected)} (الوقت المحفوظ)</SelectItem>}
        {times.map(time => <SelectItem key={time} value={time}>{label(time)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
