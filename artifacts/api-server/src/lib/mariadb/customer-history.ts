import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { GetOwnerCrmHistoryQueryParams, GetOwnerCrmProfileQueryParams } from "@workspace/api-zod";
import { normalizeCustomerPhone } from "../customerPhone";
import { authorizedProvider, countValue, crmRecords, crmSearch, moneyValue, normalizeRecord } from "./crm-records";

const PAGE_SIZE = 10;
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const historyQuery = GetOwnerCrmHistoryQueryParams.extend({ from: dateOnly.optional(), to: dateOnly.optional() })
  .refine(value => !value.from || !value.to || value.from <= value.to);

export async function sendCrmProfile(req: Request, res: Response) {
  const parsed = GetOwnerCrmProfileQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "بيانات العميل غير صالحة" });
  const { providerId } = parsed.data;
  const phone = normalizeCustomerPhone(parsed.data.phone), ownerId = req.user!.id;
  if (!await authorizedProvider(ownerId, providerId)) return res.status(404).json({ error: "الخدمة غير موجودة" });
  const result = await db.execute(sql`WITH records AS (${crmRecords(ownerId,phone,providerId)})
    SELECT COALESCE((SELECT name FROM owner_customers WHERE owner_id=${ownerId} AND phone_normalized=${phone} LIMIT 1),
      (SELECT client_name FROM records ORDER BY booking_date DESC,id DESC LIMIT 1)) AS clientName,
      ${phone} AS clientPhone,
      (SELECT client_id_number FROM records WHERE NULLIF(client_id_number,'') IS NOT NULL ORDER BY booking_date DESC,id DESC LIMIT 1) AS clientIdNumber,
      COALESCE(SUM(NOT(period<=>'quick_sale')),0) AS totalBookings,
      COALESCE(SUM(period='quick_sale'),0) AS totalSales,
      COALESCE(SUM(CASE WHEN ${!!providerId} AND cancelled THEN 0 ELSE CAST(total_price AS DECIMAL(65,2)) END),0) AS totalRevenue,
      MAX(booking_date) AS lastBookingDate,
      COALESCE(SUM(CASE WHEN contract_signed THEN 1 ELSE 0 END),0) AS contractCount,
      COALESCE(SUM(CASE WHEN COALESCE(CAST(insurance_fee AS DECIMAL(65,2)),0)>0 THEN 1 ELSE 0 END),0) AS insuranceCount,
      COALESCE((SELECT notes FROM customer_notes WHERE owner_id=${ownerId} AND client_phone=${phone} LIMIT 1),'') AS note FROM records`);
  const row = result.rows[0];
  if (!row) throw new Error("CRM profile aggregate is missing.");
  const profile = { ...row, totalBookings: countValue(row.totalBookings), totalSales: countValue(row.totalSales),
    totalRevenue: moneyValue(row.totalRevenue), contractCount: countValue(row.contractCount), insuranceCount: countValue(row.insuranceCount) };
  if (!profile.totalBookings && !profile.totalSales) return res.status(404).json({ error: "العميل غير موجود" });
  res.setHeader("Cache-Control", "private, no-store");
  return res.json(profile);
}

export async function sendCrmHistory(req: Request, res: Response) {
  const parsed = historyQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "فلاتر السجل غير صالحة" });
  const { providerId,tab="bookings",status="all",page=1,from,to } = parsed.data;
  const phone = normalizeCustomerPhone(parsed.data.phone), ownerId = req.user!.id;
  if (!await authorizedProvider(ownerId, providerId)) return res.status(404).json({ error: "الخدمة غير موجودة" });
  const search = crmSearch(parsed.data.search ?? "");
  const records = crmRecords(ownerId,phone,providerId);
  const filtered = sql`WITH records AS (${records}), filtered AS (SELECT * FROM records WHERE true
    ${tab==="contracts" ? sql`AND contract_signed` : tab==="insurance" ? sql`AND COALESCE(CAST(insurance_fee AS DECIMAL(65,2)),0)>0` : sql``}
    ${status==="active" ? sql`AND is_active` : status==="cancelled" ? sql`AND cancelled` : status==="completed" ? sql`AND NOT cancelled AND NOT is_active` : sql``}
    ${from ? sql`AND booking_date>=${from}` : sql``} ${to ? sql`AND booking_date<=${to}` : sql``}
    ${search ? sql`AND (LOCATE(${search},CAST(id AS CHAR))>0 OR LOCATE(${search},booking_date)>0)` : sql``})`;
  const order = tab==="bookings" ? sql`is_active IS NULL DESC,is_active DESC,booking_date DESC,id DESC,period`
    : sql`booking_date DESC,id DESC,period`;
  const response = await db.transaction(async tx => {
    const totals = await tx.execute(sql`${filtered} SELECT COUNT(*) AS total FROM filtered`);
    const total = countValue(totals.rows[0]?.total), totalPages = Math.max(1,Math.ceil(total/PAGE_SIZE));
    const selectedPage = Math.min(page,totalPages);
    const pageRows = await tx.execute(sql`${filtered} SELECT * FROM filtered ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${(selectedPage-1)*PAGE_SIZE}`);
    const quickIds = pageRows.rows.filter(row => row.period==="quick_sale").map(row => countValue(row.id));
    const quick = quickIds.length ? (await tx.execute(sql`SELECT id,items,payment_method,cancellation_reason FROM quick_sales
      WHERE owner_id=${ownerId} AND id IN (${sql.join(quickIds.map(id=>sql`${id}`),sql`, `)})`)).rows : [];
    const quickMap = new Map(quick.map(row => [countValue(row.id),row]));
    const propertyIds = providerId ? [] : pageRows.rows.map(row => countValue(row.id));
    const changes = propertyIds.length ? (await tx.execute(sql`SELECT booking_id,old_date,rescheduled_at FROM owner_reschedule_logs
      WHERE owner_id=${ownerId} AND booking_id IN (${sql.join(propertyIds.map(id=>sql`${id}`),sql`, `)})
      ORDER BY booking_id,rescheduled_at IS NULL DESC,rescheduled_at DESC,id DESC`)).rows : [];
    const latest = new Map<number,Record<string,unknown>>();
    for (const row of changes) if (!latest.has(countValue(row.booking_id))) latest.set(countValue(row.booking_id),row);
    const items = pageRows.rows.map(row => {
      const data = normalizeRecord(row), id = countValue(row.id), isQuick = row.period==="quick_sale";
      const sale = quickMap.get(id), change = latest.get(id);
      let summary: string|null = "";
      if (isQuick) {
        if (!sale || !Array.isArray(sale.items)) throw new Error("CRM quick-sale details are missing or invalid.");
        const parts: string[] = [];
        for (const item of sale.items) {
          if (!item || typeof item!=="object" || Array.isArray(item)) throw new Error("Invalid CRM quick-sale item.");
          if (item.name != null && item.quantity != null) parts.push(`${item.name} × ${item.quantity}`);
        }
        summary = parts.length ? parts.join("، ") : null;
      }
      delete data.client_name; delete data.client_id_number;
      return { ...data, item_summary: summary, payment_method: isQuick ? sale!.payment_method : "",
        cancellation_reason: isQuick ? sale!.cancellation_reason : null,
        original_date: providerId ? row.original_date : change?.old_date ?? null,
        rescheduled_at: providerId ? row.rescheduled_at : change?.rescheduled_at ?? null,
        record_type: isQuick ? "quick_sale" : "booking" };
    });
    return { total,totalPages,page:selectedPage,pageSize:PAGE_SIZE,items };
  }, { isolationLevel: "repeatable read" });
  res.setHeader("Cache-Control", "private, no-store");
  return res.json(response);
}
