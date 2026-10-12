import { Router, type Request, type Response, type NextFunction } from "express";
import {
  db, photographyBookingsTable, photographersTable, photographyTransfersTable, photographyReceiptsTable,
  photographyRefundsTable, photographyDeliveriesTable, siteSettingsTable,
  adminSessionsTable, adminStaffTable,
} from "@workspace/db";
import { and, eq, desc, inArray, gt } from "drizzle-orm";
import { photographyBalances, photographyStatement } from "../lib/photography-finance";
import { receiptUploadSchema, receiptCompleteSchema, requestPhotographyReceipt, completePhotographyReceipt, receiptStorage } from "../lib/photography-receipts";
import { photographyRefundSchema, requestPhotographyRefund, reconcilePhotographyRefund } from "../lib/photography-refunds";
import { getPhotographer } from "../lib/photographer-auth";
import { requireAuth, getOwnerIds } from "./owner";
import { confirmPhotographyWalletPayment } from "../lib/photography-wallet";
import { lockPhotographyAllocation } from "../lib/photography-allocation";
import { photographyCardEnabled } from "../lib/owner-services";
import { publishPhotographyBooking } from "../lib/photography-events";
import { deliverPhotographyMessage } from "../lib/photography-delivery";

export function financialMonth(value: unknown) {
  if (value === undefined) return new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 7);
  if (typeof value !== "string" || !/^(20\d{2})-(0[1-9]|1[0-2])$/.test(value)) throw new Error("month_invalid");
  return value;
}
function adminActor(req: Request) { return req.adminStaff ? `admin-staff:${req.adminStaff.id}` : req.user!.id; }
const messages: Record<string, string> = {
  refund_amount: "المبلغ يتجاوز المتبقي أو الحجز غير مدفوع",
  refund_pending: "يوجد طلب استرداد بانتظار التحقق؛ راجع حالته أولاً",
  refund_duplicate: "هذا الطلب مستخدم بمبلغ أو وجهة مختلفة",
  refund_missing: "طلب الاسترداد غير موجود",
  refund_card_unavailable: "لا توجد دفعة بطاقة قابلة للاسترداد؛ اختر محفظة المالك",
  wallet_insufficient: "رصيد المحفظة لا يغطي كامل المبلغ؛ لم يتم الخصم",
  wallet_invoice_active: "بدأ الدفع بالبطاقة لهذا الحجز؛ لا يمكن تبديل وسيلة الدفع أثناء ذلك",
  receipt_proof: "رابط الرفع منتهي أو لا يخص حسابك",
  receipt_format: "اختر إيصال PDF أو صورة JPG أو PNG أو WebP صحيحة",
  receipt_size: "حجم الإيصال يتجاوز ١٠ ميجابايت",
  month_invalid: "اختر شهراً صحيحاً",
  closed: "خدمة التصوير والتوثيق مغلقة حالياً",
  expired: "انتهت صلاحية الحجز أو سبق دفعه بوسيلة أخرى",
};
function financialError(res: Response, error: unknown) {
  const code = (error as Error).message;
  // Unexpected failures can occur after a committed payment. Never turn those
  // into a definitive rejection that causes the client to discard its retry ID.
  return res.status(code === "closed" ? 423 : messages[code] ? 409 : 500).json({ code: messages[code] ? code : "operation_unknown", error: messages[code] ?? "تعذر إتمام العملية؛ لم يتم تأكيدها. أعد التحقق من الحالة" });
}
export async function financeTransfers(photographerId?: number) {
  return db.select({
    id: photographyTransfersTable.id, photographerId: photographyTransfersTable.photographerId,
    photographerName: photographersTable.name, amountHalalas: photographyTransfersTable.amountHalalas,
    reference: photographyTransfersTable.reference, transferredAt: photographyTransfersTable.transferredAt,
    receiptId: photographyTransfersTable.receiptId, receiptName: photographyReceiptsTable.name,
    receiptContentType: photographyReceiptsTable.contentType,
  }).from(photographyTransfersTable).innerJoin(photographersTable, eq(photographersTable.id, photographyTransfersTable.photographerId))
    .leftJoin(photographyReceiptsTable, eq(photographyReceiptsTable.id, photographyTransfersTable.receiptId))
    .where(photographerId ? eq(photographyTransfersTable.photographerId, photographerId) : undefined)
    .orderBy(desc(photographyTransfersTable.transferredAt));
}
export const photographyFinancialAdmin = Router();
function validFinancialId(_req: Request, res: Response, next: NextFunction, value: string) {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) return res.status(400).json({ error: "معرّف غير صحيح" });
  return next();
}
photographyFinancialAdmin.param("id", validFinancialId);
photographyFinancialAdmin.get("/finance", async (req, res) => {
  try {
    const month = financialMonth(req.query.month);
    const people = await db.select().from(photographersTable);
    const bookings = await db.select().from(photographyBookingsTable).where(inArray(photographyBookingsTable.status, ["confirmed", "completed", "cancelled"]));
    const photographers = await Promise.all(people.map(async p => ({
      id: p.id, name: p.name, iban: p.iban, bankName: p.bankName,
      ...await photographyBalances(p.id),
      statement: photographyStatement(bookings.filter(b => b.photographerId === p.id && b.assignmentStatus === "assigned"), month),
    })));
    const transfers = (await financeTransfers()).map(t => ({ ...t, receiptUrl: t.receiptId ? `/api/photography/receipts/${t.receiptId}` : null }));
    const refunds = await db.select().from(photographyRefundsTable).orderBy(desc(photographyRefundsTable.id));
    const totals = photographers.reduce((sum, p) => ({
      pendingHalalas: sum.pendingHalalas + p.pendingHalalas, availableHalalas: sum.availableHalalas + p.availableHalalas, paidHalalas: sum.paidHalalas + p.paidHalalas,
    }), { pendingHalalas: 0, availableHalalas: 0, paidHalalas: 0 });
    return res.json({ month, photographers, transfers, refunds, totals });
  } catch (e) { return financialError(res, e); }
});
photographyFinancialAdmin.post("/receipt/upload-url", async (req, res) => {
  const parsed = receiptUploadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "اختر إيصال PDF أو صورة لا تتجاوز ١٠ ميجابايت" });
  try { return res.json(await requestPhotographyReceipt(adminActor(req), parsed.data)); } catch (e) { return financialError(res, e); }
});
photographyFinancialAdmin.post("/receipt/complete", async (req, res) => {
  const parsed = receiptCompleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات الإيصال غير صحيحة" });
  try { return res.json(await completePhotographyReceipt(adminActor(req), parsed.data)); } catch (e) { return financialError(res, e); }
});
photographyFinancialAdmin.post("/bookings/:id/refunds", async (req, res) => {
  const parsed = photographyRefundSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "أدخل مبلغاً صحيحاً وسبب الاسترداد ووجهته" });
  try { return res.json(await requestPhotographyRefund(Number(req.params.id), adminActor(req), parsed.data)); } catch (e) { return financialError(res, e); }
});
photographyFinancialAdmin.post("/refunds/:id/reconcile", async (req, res) => {
  try { return res.json(await reconcilePhotographyRefund(Number(req.params.id))); } catch (e) { return financialError(res, e); }
});

export const photographyFinancialPublic = Router();
photographyFinancialPublic.param("id", validFinancialId);
photographyFinancialPublic.get("/portal/statement", async (req, res) => {
  const person = await getPhotographer(req);
  if (!person) return res.status(401).json({ error: "سجل الدخول إلى بوابة المصور" });
  try {
    const month = financialMonth(req.query.month);
    const bookings = await db.select().from(photographyBookingsTable).where(and(
      eq(photographyBookingsTable.photographerId, person.id), eq(photographyBookingsTable.assignmentStatus, "assigned"),
      inArray(photographyBookingsTable.status, ["confirmed", "completed", "cancelled"]),
    ));
    return res.json({ ...await photographyBalances(person.id), month, statement: photographyStatement(bookings, month),
      transfers: (await financeTransfers(person.id)).map(t => ({ ...t, receiptUrl: t.receiptId ? `/api/photography/receipts/${t.receiptId}` : null })) });
  } catch (e) { return financialError(res, e); }
});
async function sendReceipt(req: Request, res: Response, photographerId?: number) {
  const id = Number(req.params.id);
  const [receipt] = await db.select().from(photographyReceiptsTable).where(eq(photographyReceiptsTable.id, id));
  if (!receipt) return res.status(404).json({ error: "الإيصال غير موجود" });
  if (photographerId) {
    const [transfer] = await db.select().from(photographyTransfersTable).where(and(eq(photographyTransfersTable.receiptId, id), eq(photographyTransfersTable.photographerId, photographerId)));
    if (!transfer) return res.status(403).json({ error: "الإيصال لا يخص حسابك" });
  }
  const file = await receiptStorage.getObjectEntityFile(receipt.objectPath);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", receipt.contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
  res.setHeader("Content-Disposition", `${req.query.download === "1" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(receipt.name)}`);
  return file.createReadStream().on("error", () => { if (!res.headersSent) res.status(404).end(); else res.destroy(); }).pipe(res);
}
photographyFinancialPublic.get("/receipts/:id", async (req: Request, res: Response, next: NextFunction) => {
  const adminId = process.env.ADMIN_USER_ID;
  let superadmin = !!(adminId && req.isAuthenticated() && req.user?.id === adminId);
  if (!superadmin && typeof req.cookies?.admin_staff_sid === "string") {
    const [session] = await db.select({ id: adminStaffTable.id }).from(adminSessionsTable)
      .innerJoin(adminStaffTable, eq(adminStaffTable.id, adminSessionsTable.adminStaffId))
      .where(and(eq(adminSessionsTable.sid, req.cookies.admin_staff_sid), gt(adminSessionsTable.expire, new Date()), eq(adminStaffTable.isActive, true), eq(adminStaffTable.isSuperAdmin, true))).limit(1);
    superadmin = !!session;
  }
  if (superadmin) return sendReceipt(req, res);
  const person = await getPhotographer(req);
  if (person) return sendReceipt(req, res, person.id);
  return res.status(403).json({ error: "الإيصال خاص بالمشرف العام والمصور صاحب الحوالة" });
});
photographyFinancialPublic.post("/bookings/:id/wallet-pay", requireAuth, async (req, res) => {
  const owners = await getOwnerIds(req);
  let newConfirmation = false;
  try {
    const booking = await db.transaction(async tx => {
      await lockPhotographyAllocation(tx);
      const [b] = await tx.select().from(photographyBookingsTable).where(and(eq(photographyBookingsTable.id, Number(req.params.id)), inArray(photographyBookingsTable.ownerId, owners))).for("update");
      if (!b) throw new Error("expired");
      if (b.paymentMethod === "wallet" && b.paymentId === `wallet:photography:${b.id}`) return b;
      const [setting] = await tx.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "photography_enabled")).for("share");
      if (setting?.value !== "true" || !await photographyCardEnabled(tx)) throw new Error("closed");
      const confirmed = await confirmPhotographyWalletPayment(tx, b);
      newConfirmation = true;
      return confirmed;
    });
    if (newConfirmation) {
      publishPhotographyBooking(booking.photographerId, booking.id);
      const notices = await db.select().from(photographyDeliveriesTable).where(and(eq(photographyDeliveriesTable.bookingId, booking.id), eq(photographyDeliveriesTable.status, "pending")));
      for (const notice of notices) void deliverPhotographyMessage(notice.id).catch(() => undefined);
    }
    return res.json({ booking });
  } catch (e) { return financialError(res, e); }
});
