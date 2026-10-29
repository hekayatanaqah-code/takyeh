import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { employeeDateBounds } from "@/lib/employeeDate";

export function EmployeeDatePicker({ kind, value, onChange, className }: {
  kind: "birth" | "hire";
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return <DualCalendarPicker
    value={value}
    onChange={onChange}
    placeholder={kind === "birth" ? "اختر تاريخ الميلاد" : "اختر تاريخ التعيين"}
    mode="gregorian"
    {...employeeDateBounds(kind)}
    selectOnOpen={false}
    className={className}
  />;
}
