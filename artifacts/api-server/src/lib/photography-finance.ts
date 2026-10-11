import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { db, photographyContractsTable, photographyBookingsTable, photographyTransfersTable } from "@workspace/db";
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
    eq(photographyBookingsTable.photographerId, photographerId), inArray(photographyBookingsTable.status, ["confirmed", "completed"]),
  ));
  const transfers = await tx.select().from(photographyTransfersTable).where(eq(photographyTransfersTable.photographerId, photographerId)).orderBy(desc(photographyTransfersTable.transferredAt));
  const earnedHalalas = bookings.reduce((sum, booking) => sum + booking.photographerEarningsHalalas, 0);
  const transferredHalalas = transfers.reduce((sum, transfer) => sum + transfer.amountHalalas, 0);
  return { netDueHalalas: earnedHalalas - transferredHalalas, transferredHalalas, transfers };
}
