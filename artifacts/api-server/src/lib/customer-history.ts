import type { Request, Response } from "express";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { GetOwnerCrmHistoryQueryParams, GetOwnerCrmProfileQueryParams } from "@workspace/api-zod";
import { customerPhoneSql, normalizeCustomerPhone } from "./customerPhone";

export const CRM_PAGE_SIZE = 10;
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
export const crmHistoryQuery = GetOwnerCrmHistoryQueryParams.extend({
  from: dateOnly.optional(), to: dateOnly.optional(),
}).refine(value => !value.from || !value.to || value.from <= value.to);

export function normalizeCrmSearch(value: string) {
  return value.trim().replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/^#\s*/, "");
}

/** SQL equivalent of booking-time's parser; accepts the stored Arabic times. */
export function crmTimeMinutes(value: SQL): SQL {
  return sql`(SELECT CASE
    WHEN m IS NULL OR (m[2])::int > 59 OR (m[1])::int > CASE WHEN m[3] IS NULL THEN 23 ELSE 12 END
      OR (m[3] IS NOT NULL AND (m[1])::int < 1) THEN NULL
    ELSE CASE WHEN m[3] IS NULL THEN (m[1])::int
      ELSE (m[1])::int % 12 + CASE WHEN m[3] IN ('م', 'pm') THEN 12 ELSE 0 END END * 60 + coalesce((m[2])::int, 0)
    END FROM (SELECT regexp_match(lower(translate(trim(coalesce(${value}, '')),
      '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')),
      '^([0-9]{1,2})(?::([0-9]{2}))?[[:space:]]*(ص|م|am|pm)?$') AS m) parsed)`;
}

export function crmPropertyCheckout(now: Date): SQL {
  // Live property times win as a whole, matching propertyStayComplete().
  const time = (suffix: "in" | "out") => {
    const column = (name: string) => sql.raw(`CASE WHEN c.id IS NOT NULL THEN c.${name} ELSE s.${name} END`);
    return crmTimeMinutes(sql`coalesce(nullif(CASE b.period
      WHEN 'morning' THEN ${column(`morning_check_${suffix}`)}
      WHEN 'evening' THEN ${column(`evening_check_${suffix}`)}
      ELSE ${column(`full_day_check_${suffix}`)} END, ''), ${column(`check_${suffix}_time`)})`);
  };
  return sql`
    LEFT JOIN chalet_submissions s ON s.id = b.submission_id
    LEFT JOIN LATERAL (SELECT * FROM chalets WHERE submission_id = b.submission_id ORDER BY id LIMIT 1) c ON true
    CROSS JOIN LATERAL (SELECT ${time("in")} AS arrival, ${time("out")} AS departure) timing
    CROSS JOIN LATERAL (SELECT
      (b.booking_date::date::timestamp AT TIME ZONE 'Asia/Riyadh') +
      CASE WHEN timing.departure IS NULL THEN greatest(1, coalesce(b.duration_days, 1)) * interval '1 day'
      ELSE (greatest(1, coalesce(b.duration_days, 1)) - 1 +
        CASE WHEN timing.arrival IS NOT NULL THEN (timing.departure <= timing.arrival)::int
          ELSE (b.period IS DISTINCT FROM 'morning' AND timing.departure < 720)::int END) * interval '1 day'
        + timing.departure * interval '1 minute' END AS checkout_at,
      ${now.toISOString()}::timestamptz AS observed_at) stay`;
}

function source(ownerId: string, phone: string, providerId?: number, withTiming = false, now = new Date()): SQL {
  if (providerId) {
    const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
    return sql`SELECT b.id, b.client_name, b.client_id_number, b.date_str AS booking_date,
      NULL::int AS duration_days, b.duration AS period, coalesce(b.amount, 0)::text AS total_price,
      p.business_name AS chalet_name, b.cancelled_at,
      (b.cancelled_at IS NOT NULL OR b.status IN ('cancelled', 'canceled')) AS cancelled,
      b.contract_signed, b.insurance_amount::text AS insurance_fee,
      (coalesce(b.insurance_amount, 0) > 0) AS insurance_received,
      (b.insurance_status = 'refunded') AS insurance_refunded,
      b.insurance_deduct_amount::text AS insurance_deducted,
      b.previous_date_str AS original_date, b.last_edited_at AS rescheduled_at,
      (b.cancelled_at IS NULL AND b.status NOT IN ('cancelled', 'canceled', 'completed')
        AND b.date_str >= ${today}) AS is_active
      FROM service_appointments b JOIN service_providers p ON p.id = b.provider_id
      WHERE b.owner_id = ${ownerId} AND p.owner_id = ${ownerId}
        AND ${customerPhoneSql(sql`b.client_phone`)} = ${phone}
      UNION ALL
      SELECT b.id, b.client_name, NULL::text, b.date_str, NULL::int, 'quick_sale'::text,
        b.total::text, b.provider_name, b.cancelled_at, (b.status = 'cancelled'),
        false, NULL::text, false, false, NULL::text, NULL::text, NULL::timestamptz, false
      FROM quick_sales b WHERE b.owner_id = ${ownerId} AND b.client_phone = ${phone}`;
  }
  return sql`SELECT b.id, b.client_name, b.contract_signer_id AS client_id_number,
    b.booking_date, b.duration_days, b.period, coalesce(b.total_price, 0)::text AS total_price,
    s.name_ar AS chalet_name, b.cancelled_at, (b.cancelled_at IS NOT NULL) AS cancelled,
    b.contract_signed, b.insurance_fee::text, b.insurance_received, b.insurance_refunded,
    b.insurance_deducted::text, NULL::text AS original_date, NULL::timestamptz AS rescheduled_at,
    ${withTiming ? sql`(b.cancelled_at IS NULL AND stay.observed_at < stay.checkout_at)` : sql`false`} AS is_active
    FROM owner_bookings b
    ${withTiming ? crmPropertyCheckout(now) : sql`LEFT JOIN chalet_submissions s ON s.id = b.submission_id`}
    WHERE b.owner_id = ${ownerId} AND ${customerPhoneSql(sql`b.client_phone`)} = ${phone}`;
}

async function authorizedProvider(ownerId: string, providerId?: number) {
  if (!providerId) return true;
  const result = await db.execute(sql`SELECT id FROM service_providers WHERE id = ${providerId} AND owner_id = ${ownerId} LIMIT 1`);
  return result.rows.length > 0;
}

export async function sendCrmProfile(req: Request, res: Response) {
  const parsed = GetOwnerCrmProfileQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "بيانات العميل غير صالحة" });
  const { providerId } = parsed.data;
  const phone = normalizeCustomerPhone(parsed.data.phone);
  const ownerId = req.user!.id;
  if (!await authorizedProvider(ownerId, providerId)) return res.status(404).json({ error: "الخدمة غير موجودة" });
  const result = await db.execute(sql`WITH records AS (${source(ownerId, phone, providerId)})
    SELECT coalesce((SELECT name FROM owner_customers WHERE owner_id = ${ownerId} AND phone_normalized = ${phone} LIMIT 1),
      (SELECT client_name FROM records ORDER BY booking_date DESC, id DESC LIMIT 1)) AS "clientName",
      ${phone}::text AS "clientPhone",
      (SELECT client_id_number FROM records WHERE nullif(client_id_number, '') IS NOT NULL ORDER BY booking_date DESC, id DESC LIMIT 1) AS "clientIdNumber",
      count(*) FILTER (WHERE period IS DISTINCT FROM 'quick_sale')::int AS "totalBookings",
      count(*) FILTER (WHERE period = 'quick_sale')::int AS "totalSales",
      coalesce(sum(CASE WHEN ${!!providerId} AND cancelled THEN 0 ELSE total_price::numeric END), 0)::float8 AS "totalRevenue",
      max(booking_date) AS "lastBookingDate",
      count(*) FILTER (WHERE contract_signed)::int AS "contractCount",
      count(*) FILTER (WHERE coalesce(insurance_fee::numeric, 0) > 0)::int AS "insuranceCount",
      coalesce((SELECT notes FROM customer_notes WHERE owner_id = ${ownerId} AND client_phone = ${phone} LIMIT 1), '') AS note
    FROM records`);
  const profile = result.rows[0];
  if (!profile || (!profile.totalBookings && !profile.totalSales)) return res.status(404).json({ error: "العميل غير موجود" });
  res.setHeader("Cache-Control", "private, no-store");
  return res.json(profile);
}

export async function sendCrmHistory(req: Request, res: Response) {
  const parsed = crmHistoryQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "فلاتر السجل غير صالحة" });
  const { providerId, tab = "bookings", status = "all", page = 1, from, to } = parsed.data;
  const phone = normalizeCustomerPhone(parsed.data.phone);
  const ownerId = req.user!.id;
  if (!await authorizedProvider(ownerId, providerId)) return res.status(404).json({ error: "الخدمة غير موجودة" });
  const search = normalizeCrmSearch(parsed.data.search ?? "");
  const order = tab === "bookings" ? sql`is_active DESC, booking_date DESC, id DESC, period` : sql`booking_date DESC, id DESC, period`;
  const result = await db.execute(sql`WITH records AS (${source(ownerId, phone, providerId, true)}),
    filtered AS (SELECT * FROM records WHERE true
      ${tab === "contracts" ? sql`AND contract_signed` : tab === "insurance" ? sql`AND coalesce(insurance_fee::numeric, 0) > 0` : sql``}
      ${status === "active" ? sql`AND is_active` : status === "cancelled" ? sql`AND cancelled` : status === "completed" ? sql`AND NOT cancelled AND NOT is_active` : sql``}
      ${from ? sql`AND booking_date >= ${from}` : sql``} ${to ? sql`AND booking_date <= ${to}` : sql``}
      ${search ? sql`AND (position(${search} in id::text) > 0 OR position(${search} in booking_date) > 0)` : sql``}),
    totals AS (SELECT count(*)::int AS total,
      greatest(1, ceil(count(*)::numeric / ${CRM_PAGE_SIZE})::int) AS "totalPages" FROM filtered),
    bounds AS (SELECT *, least(${page}, "totalPages")::int AS page FROM totals),
    page_rows AS (SELECT * FROM filtered ORDER BY ${order} LIMIT ${CRM_PAGE_SIZE}
      OFFSET (SELECT (page - 1) * ${CRM_PAGE_SIZE} FROM bounds)),
    enriched AS (SELECT r.*,
      CASE WHEN r.period = 'quick_sale' THEN (SELECT string_agg(item->>'name' || ' × ' || (item->>'quantity'), '، ')
        FROM quick_sales qs, jsonb_array_elements(qs.items) item WHERE qs.id = r.id AND qs.owner_id = ${ownerId}) ELSE '' END AS item_summary,
      CASE WHEN r.period = 'quick_sale' THEN (SELECT payment_method FROM quick_sales WHERE id = r.id AND owner_id = ${ownerId}) ELSE '' END AS payment_method,
      CASE WHEN r.period = 'quick_sale' THEN (SELECT cancellation_reason FROM quick_sales WHERE id = r.id AND owner_id = ${ownerId}) ELSE NULL END AS cancellation_reason,
      ${providerId ? sql`r.original_date AS latest_original_date, r.rescheduled_at AS latest_rescheduled_at` :
        sql`log.old_date AS latest_original_date, log.rescheduled_at AS latest_rescheduled_at`}
      FROM page_rows r ${providerId ? sql`` : sql`LEFT JOIN LATERAL (
        SELECT old_date, rescheduled_at FROM owner_reschedule_logs
        WHERE owner_id = ${ownerId} AND booking_id = r.id ORDER BY rescheduled_at DESC, id DESC LIMIT 1) log ON true`})
    SELECT bounds.*, ${CRM_PAGE_SIZE}::int AS "pageSize",
      coalesce((SELECT jsonb_agg((to_jsonb(enriched) - 'client_name' - 'client_id_number' - 'latest_original_date' - 'latest_rescheduled_at') ||
        jsonb_build_object('original_date', latest_original_date, 'rescheduled_at', latest_rescheduled_at,
          'record_type', CASE WHEN period = 'quick_sale' THEN 'quick_sale' ELSE 'booking' END)
        ORDER BY ${order}) FROM enriched), '[]'::jsonb) AS items FROM bounds`);
  res.setHeader("Cache-Control", "private, no-store");
  return res.json(result.rows[0]);
}
