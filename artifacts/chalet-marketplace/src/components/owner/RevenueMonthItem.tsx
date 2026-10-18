import * as SelectPrimitive from "@radix-ui/react-select";
import { Check } from "lucide-react";

/** Explicit ItemText sizing avoids content-width alignment and inherited LTR layout. */
export function RevenueMonthItem({ value, primary, secondary }: {
  value: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <SelectPrimitive.Item
      value={value}
      textValue={primary}
      dir="rtl"
      className="relative flex w-full cursor-default select-none items-center rounded-sm py-2 ps-2 pe-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
      style={{ direction: "rtl", textAlign: "right", justifyContent: "flex-start" }}
    >
      <SelectPrimitive.ItemText asChild>
        <span className="min-w-0 flex-1" style={{ display: "block", textAlign: "right" }}>
          <span className="font-semibold text-sm leading-tight" style={{ display: "block", textAlign: "right" }}>{primary}</span>
          {secondary && (
            <span className="mt-0.5 text-xs text-muted-foreground leading-tight" style={{ display: "block", textAlign: "right" }}>{secondary}</span>
          )}
        </span>
      </SelectPrimitive.ItemText>
      <span className="absolute end-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator><Check className="h-4 w-4" /></SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}
