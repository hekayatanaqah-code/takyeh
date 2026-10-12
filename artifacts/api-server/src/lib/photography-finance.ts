import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { db, photographyContractsTable, photographyBookingsTable, photographyTransfersTable, photographyRefundsTable } from "@workspace/db";
import { and, eq, inArray, desc } from "drizzle-orm";

export const SAUDI_BANKS = ["الإنماء", "الراجحي", "الأهلي السعودي", "الرياض", "البلاد", "الجزيرة", "السعودي الأول", "العربي الوطني", "السعودي الفرنسي", "السعودي للاستثمار", "الخليج الدولي", "إس تي سي بنك", "دال ثلاثمائة وستون"];
export function validSaudiIban(iban: string) {
  if (!/^SA\d{4}[A-Z0-9]{18}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const digits = /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
export const ibanSchema = z.string().transform(value => value.replace(/[\s-]/g, "").toUpperCase()
  .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))).refine(validSaudiIban, "رقم الآيبان السعودي غير صحيح");
export const bankSchema = z.string().trim().min(2, "أدخل اسم البنك").max(120, "اسم البنك طويل جداً")
  .refine(value => value !== "بنك آخر" && value !== "__other__", "اكتب اسم البنك الآخر");
export function cleanContractHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "h2", "h3", "ul", "ol", "li", "blockquote", "a"],
    allowedAttributes: { a: ["href"] }, allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
  });
}
export async function currentPhotographyContract(tx: Pick<typeof db, "select"> = db) {
  const [contract] = await tx.select().from(photographyContractsTable).orderBy(desc(photographyContractsTable.id)).limit(1);
  return contract ?? null;
}
export async function photographyBalances(photographerId: number, tx: Pick<typeof db, "select"> = db) {
  const bookings = await tx.select().from(photographyBookingsTable).where(and(
    eq(photographyBookingsTable.photographerId, photographerId), eq(photographyBookingsTable.assignmentStatus, "assigned"), inArray(photographyBookingsTable.status, ["confirmed", "completed"]),
  ));
  const transfers = await tx.select().from(photographyTransfersTable).where(eq(photographyTransfersTable.photographerId, photographerId)).orderBy(desc(photographyTransfersTable.transferredAt));
  const pendingRefunds = bookings.length ? await tx.select().from(photographyRefundsTable).where(and(
    inArray(photographyRefundsTable.bookingId, bookings.map(b => b.id)), eq(photographyRefundsTable.status, "pending"),
  )) : [];
  let earnedHalalas = 0, pendingHalalas = 0;
  for (const b of bookings) {
    const reserved = pendingRefunds.filter(r => r.bookingId === b.id).reduce((sum, r) => sum + r.amountHalalas, 0);
    const refundableNet = photographyRemainingQuote(b, Math.min(b.priceHalalas, b.refundedHalalas + reserved)).netHalalas;
    if (b.status === "completed" && b.deliveredAt) earnedHalalas += refundableNet;
    else pendingHalalas += refundableNet;
  }
  const transferredHalalas = transfers.reduce((sum, transfer) => sum + transfer.amountHalalas, 0);
  const signedDue = earnedHalalas - transferredHalalas;
  return {
    pendingHalalas, availableHalalas: Math.max(0, signedDue), paidHalalas: transferredHalalas,
    recoverableHalalas: Math.max(0, -signedDue), netDueHalalas: Math.max(0, signedDue),
    transferredHalalas, transfers,
  };
}
export function photographyRemainingQuote(b: { priceHalalas: number; commissionHalalas: number }, refundedHalalas: number) {
  const totalHalalas = Math.max(0, b.priceHalalas - refundedHalalas);
  const commissionHalalas = b.priceHalalas ? Math.round(b.commissionHalalas * totalHalalas / b.priceHalalas) : 0;
  return { totalHalalas, commissionHalalas, netHalalas: totalHalalas - commissionHalalas };
}
export function photographyStatement(bookings: typeof photographyBookingsTable.$inferSelect[], month: string) {
  const rows = bookings.filter(b => new Date(+b.createdAt + 3 * 3600000).toISOString().startsWith(month));
  const totals = rows.reduce((sum, b) => {
    const quote = photographyRemainingQuote(b, b.refundedHalalas);
    return {
      count: sum.count + 1, totalHalalas: sum.totalHalalas + b.priceHalalas,
      commissionHalalas: sum.commissionHalalas + (b.status === "cancelled" ? quote.totalHalalas : quote.commissionHalalas),
      netHalalas: sum.netHalalas + (b.status === "cancelled" ? 0 : quote.netHalalas),
      refundedHalalas: sum.refundedHalalas + b.refundedHalalas,
    };
  }, { count: 0, totalHalalas: 0, commissionHalalas: 0, netHalalas: 0, refundedHalalas: 0 });
  return { ...totals, bookings: rows.map(b => {
    const quote = photographyRemainingQuote(b, b.refundedHalalas);
    return { ...b, commissionHalalas: b.status === "cancelled" ? quote.totalHalalas : quote.commissionHalalas,
      photographerEarningsHalalas: b.status === "cancelled" ? 0 : quote.netHalalas };
  }) };
}
