import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, ownerStaffTable, staffHoldingsTable } from "@workspace/db";
import { CreateStaffHoldingBody, SettleStaffHoldingBody } from "@workspace/api-zod";
import { z } from "zod";

// Generated date schemas use Date, whereas calendar dates cross JSON as strings.
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "تاريخ غير صحيح");

export const holdingInput = CreateStaffHoldingBody.extend({
  description: z.string().trim().min(1).max(500),
  recordedOn: calendarDate,
  amount: z.number().finite().nonnegative().max(99999999.99)
    .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, "أدخل منزلتين عشريتين كحد أقصى"),
  notes: z.string().trim().max(2000),
}).refine(value => value.kind === "custody" || value.amount > 0, "المبلغ يجب أن يكون أكبر من صفر");

export const settlementInput = SettleStaffHoldingBody.extend({
  settledOn: calendarDate,
  settlementNotes: z.string().trim().min(1).max(2000),
});

const router = Router({ mergeParams: true });
function positiveId(value: unknown) {
  const parsed = z.coerce.number().int().positive().safeParse(value);
  return parsed.success ? parsed.data : null;
}

router.get<{ staffId: string }>("/", async (req, res) => {
  const ownerId = req.user!.id;
  const staffId = positiveId(req.params.staffId);
  if (!staffId) { res.status(400).json({ error: "موظف غير صحيح" }); return; }
  const [employee] = await db.select({ id: ownerStaffTable.id }).from(ownerStaffTable)
    .where(and(eq(ownerStaffTable.id, staffId), eq(ownerStaffTable.ownerId, ownerId)));
  if (!employee) { res.status(404).json({ error: "لم يُعثر على الموظف" }); return; }
  const rows = await db.select().from(staffHoldingsTable)
    .where(and(eq(staffHoldingsTable.ownerId, ownerId), eq(staffHoldingsTable.staffId, staffId)))
    .orderBy(desc(staffHoldingsTable.recordedOn), desc(staffHoldingsTable.id));
  res.json(rows);
});

router.post<{ staffId: string }>("/", async (req, res) => {
  const ownerId = req.user!.id;
  const staffId = positiveId(req.params.staffId);
  const parsed = holdingInput.safeParse(req.body);
  if (!staffId || !parsed.success) { res.status(400).json({ error: "تحقق من نوع السجل والوصف والمبلغ والتاريخ" }); return; }
  const input = parsed.data;
  const result = await db.transaction(async tx => {
    const [employee] = await tx.select({ id: ownerStaffTable.id }).from(ownerStaffTable)
      .where(and(eq(ownerStaffTable.id, staffId), eq(ownerStaffTable.ownerId, ownerId))).for("update");
    if (!employee) return { status: 404, data: { error: "لم يُعثر على الموظف" } };
    const [row] = await tx.insert(staffHoldingsTable).values({
      ...input, ownerId, staffId, amount: input.amount.toFixed(2),
    }).onConflictDoNothing({ target: [staffHoldingsTable.ownerId, staffHoldingsTable.requestId] }).returning();
    if (row) return { status: 201, data: row };
    const [existing] = await tx.select().from(staffHoldingsTable).where(and(
      eq(staffHoldingsTable.ownerId, ownerId), eq(staffHoldingsTable.requestId, input.requestId),
    ));
    if (existing?.staffId === staffId && existing.kind === input.kind && existing.description === input.description
      && Number(existing.amount) === input.amount && existing.recordedOn === input.recordedOn && existing.notes === input.notes) {
      return { status: 201, data: existing };
    }
    return { status: 409, data: { error: "تم استخدام مرجع الحفظ لبيانات مختلفة؛ حدّث السجل قبل إعادة المحاولة" } };
  });
  res.status(result.status).json(result.data);
});

router.post<{ staffId: string; holdingId: string }>("/:holdingId/settle", async (req, res) => {
  const ownerId = req.user!.id;
  const staffId = positiveId(req.params.staffId);
  const holdingId = positiveId(req.params.holdingId);
  const parsed = settlementInput.safeParse(req.body);
  if (!staffId || !holdingId || !parsed.success) { res.status(400).json({ error: "أدخل تاريخ التسوية وبيان الاستلام أو الإرجاع" }); return; }
  const result = await db.transaction(async tx => {
    const [employee] = await tx.select({ id: ownerStaffTable.id }).from(ownerStaffTable)
      .where(and(eq(ownerStaffTable.id, staffId), eq(ownerStaffTable.ownerId, ownerId))).for("update");
    if (!employee) return { status: 404, data: { error: "لم يُعثر على الموظف" } };
    const scope = and(eq(staffHoldingsTable.ownerId, ownerId), eq(staffHoldingsTable.staffId, staffId), eq(staffHoldingsTable.id, holdingId));
    const [row] = await tx.select().from(staffHoldingsTable).where(scope).for("update");
    if (!row) return { status: 404, data: { error: "لم يُعثر على السجل" } };
    if (row.status !== "open") return { status: 409, data: { error: "سبق توثيق تسوية هذا السجل" } };
    if (parsed.data.settledOn < row.recordedOn) return { status: 400, data: { error: "تاريخ التسوية لا يسبق تاريخ التسجيل" } };
    const [updated] = await tx.update(staffHoldingsTable).set({
      status: "settled", ...parsed.data,
    }).where(scope).returning();
    return { status: 200, data: updated };
  });
  res.status(result.status).json(result.data);
});

export default router;
