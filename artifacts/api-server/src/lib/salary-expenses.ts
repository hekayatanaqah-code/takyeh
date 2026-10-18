import { db, ownerExpensesTable, ownerStaffTable, salaryLogsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

interface SalaryPayment {
  staffId: number;
  month: string;
  bonus: number;
  deduction: number;
  notes?: string;
  bonusNotes?: string;
  deductionNotes?: string;
}

/** Persist the salary confirmation and its expense together, never as two independent writes. */
export async function paySalaryWithExpense(ownerId: string, payment: SalaryPayment) {
  return db.transaction(async tx => {
    // Lock a row that exists even before the first payroll log. Concurrent confirmations
    // for this employee must check paidAt again after the earlier transaction commits.
    const [staff] = await tx.select().from(ownerStaffTable)
      .where(and(eq(ownerStaffTable.id, payment.staffId), eq(ownerStaffTable.ownerId, ownerId)))
      .for("update");
    if (!staff) return { kind: "not-found" } as const;

    const [existing] = await tx.select().from(salaryLogsTable).where(and(
      eq(salaryLogsTable.ownerId, ownerId),
      eq(salaryLogsTable.staffId, payment.staffId),
      eq(salaryLogsTable.month, payment.month),
    )).limit(1);
    if (existing?.paidAt) return { kind: "already-paid" } as const;

    const netCents = Math.round(Number(staff.baseSalary) * 100) +
      Math.round(payment.bonus * 100) - Math.round(payment.deduction * 100);
    if (!Number.isSafeInteger(netCents) || netCents <= 0 || netCents > 9_999_999_999) {
      return { kind: "invalid-amount" } as const;
    }
    const paidAt = new Date();
    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(paidAt);
    const [expense] = await tx.insert(ownerExpensesTable).values({
      ownerId,
      category: "salaries",
      amount: (netCents / 100).toFixed(2),
      dateStr,
      notes: `راتب الموظف - ${staff.name} — ${payment.month}${payment.notes ? ` — ${payment.notes}` : ""}`,
      receiptUrl: null,
      submissionId: null,
    }).returning();

    const values = {
      bonus: payment.bonus.toFixed(2),
      deduction: payment.deduction.toFixed(2),
      notes: payment.notes ?? null,
      bonusNotes: payment.bonusNotes ?? null,
      deductionNotes: payment.deductionNotes ?? null,
      paidAt,
      expenseId: expense.id,
    };
    const [salaryLog] = existing
      ? await tx.update(salaryLogsTable).set(values).where(eq(salaryLogsTable.id, existing.id)).returning()
      : await tx.insert(salaryLogsTable).values({
        ownerId, staffId: staff.id, month: payment.month, ...values,
      }).returning();
    return { kind: "paid", salaryLog, expense } as const;
  });
}
