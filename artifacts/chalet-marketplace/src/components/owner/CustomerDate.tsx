import { customerDates, type CustomerCalendar } from "@/lib/customerPresentation";

export function CustomerDate({ value, preference }: {
  value?: string | null; preference: CustomerCalendar;
}) {
  const dates = customerDates(value, preference);
  return dates ? <span className="flex flex-col gap-0.5">
    <span className="font-medium text-foreground">{dates[0]}</span>
    <span className="text-xs font-normal text-muted-foreground">{dates[1]}</span>
  </span> : <span className="text-muted-foreground">—</span>;
}
