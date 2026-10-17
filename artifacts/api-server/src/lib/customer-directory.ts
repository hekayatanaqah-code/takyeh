import type { Request, Response } from "express";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import { GetOwnerCrmCustomersQueryParams } from "@workspace/api-zod";
import { crmPropertyCheckout, normalizeCrmSearch } from "./customer-history";

export const CUSTOMER_DIRECTORY_PAGE_SIZE = 20;

/** Read-only directory: aggregate, search and sort inside PostgreSQL, never in the browser. */
export async function sendCrmCustomers(req: Request, res: Response) {
  const parsed = GetOwnerCrmCustomersQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "فلاتر قائمة العملاء غير صالحة" });
  const { scope = "all", source = "all", providerId, sort = "activity", page = 1 } = parsed.data;
  const ownerId = req.user!.id;
  if (providerId && scope !== "service") return res.status(400).json({ error: "يجب تحديد نطاق الخدمة" });
  if (providerId) {
    const provider = await db.execute(sql`SELECT id FROM service_providers WHERE id = ${providerId} AND owner_id = ${ownerId}`);
    if (!provider.rows.length) return res.status(404).json({ error: "الخدمة غير موجودة" });
  }
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  const sources: SQL[] = [];
  if (scope !== "service") sources.push(sql`
    SELECT b.id, b.client_name, coalesce(b.client_phone, '') AS client_phone,
      b.booking_date, coalesce(b.total_price, 0) AS revenue, 'chalet'::text AS kind,
      NULL::text AS provider_name, (stay.observed_at < stay.checkout_at) AS is_active
    FROM owner_bookings b ${crmPropertyCheckout(now)}
    WHERE b.owner_id = ${ownerId} AND b.cancelled_at IS NULL`);
  if (scope !== "chalet") sources.push(sql`
    SELECT b.id, b.client_name, coalesce(b.client_phone, '') AS client_phone,
      b.date_str AS booking_date,
      CASE WHEN b.cancelled_at IS NOT NULL OR b.status IN ('cancelled', 'canceled')
        THEN 0 ELSE coalesce(b.amount, 0) END AS revenue,
      'service'::text AS kind, p.business_name AS provider_name,
      (b.cancelled_at IS NULL AND b.status NOT IN ('cancelled', 'canceled', 'completed') AND b.date_str >= ${today}) AS is_active
    FROM service_appointments b JOIN service_providers p ON p.id = b.provider_id
    WHERE b.owner_id = ${ownerId} AND p.owner_id = ${ownerId}
      ${providerId ? sql`AND b.provider_id = ${providerId}` : sql``}`);
  const search = normalizeCrmSearch(parsed.data.search ?? "");
  // Strip spacing/punctuation only for phone matching; names retain literal substring semantics.
  const phoneSearch = search.replace(/[\s()+.-]/g, "");
  const order = sort === "bookings" ? sql`total_bookings DESC, last_booking_date DESC, customer_key`
    : sort === "revenue" ? sql`total_revenue DESC, last_booking_date DESC, customer_key`
    : sql`has_active DESC, last_booking_date DESC, customer_key`;
  const result = await db.execute(sql`
    WITH records AS (${sql.join(sources, sql` UNION ALL `)}),
    identified AS (SELECT *, CASE WHEN trim(client_phone) <> '' THEN client_phone ELSE 'name:' || client_name END AS customer_key FROM records),
    customers AS (SELECT customer_key,
      (array_agg(client_name ORDER BY booking_date DESC, id DESC, kind))[1] AS client_name,
      max(client_phone) AS client_phone, count(*)::int AS total_bookings,
      sum(revenue)::float8 AS total_revenue, max(booking_date) AS last_booking_date,
      bool_or(is_active) AS has_active,
      CASE WHEN bool_or(kind = 'chalet') AND bool_or(kind = 'service') THEN 'both'
        WHEN bool_or(kind = 'service') THEN 'service' ELSE 'chalet' END AS source,
      coalesce(array_agg(DISTINCT provider_name ORDER BY provider_name) FILTER (WHERE provider_name IS NOT NULL), ARRAY[]::text[]) AS providers
      FROM identified GROUP BY customer_key),
    filtered AS (SELECT * FROM customers WHERE true
      ${source === "all" ? sql`` : sql`AND (source = ${source} OR source = 'both')`}
      ${search ? sql`AND (position(lower(${search}) in lower(client_name)) > 0
        ${phoneSearch ? sql`OR position(${phoneSearch} in translate(regexp_replace(client_phone, '[[:space:]()+.-]', '', 'g'),
          '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')) > 0` : sql``})` : sql``}),
    totals AS (SELECT count(*)::int AS total,
      (SELECT count(*)::int FROM customers) AS "totalCustomers",
      greatest(1, ceil(count(*)::numeric / ${CUSTOMER_DIRECTORY_PAGE_SIZE})::int) AS "totalPages" FROM filtered),
    bounds AS (SELECT *, least(${page}, "totalPages")::int AS page FROM totals),
    page_rows AS (SELECT * FROM filtered ORDER BY ${order} LIMIT ${CUSTOMER_DIRECTORY_PAGE_SIZE}
      OFFSET (SELECT (page - 1) * ${CUSTOMER_DIRECTORY_PAGE_SIZE} FROM bounds))
    SELECT bounds.*, ${CUSTOMER_DIRECTORY_PAGE_SIZE}::int AS "pageSize",
      coalesce((SELECT jsonb_agg(to_jsonb(page_rows) - 'customer_key' ORDER BY ${order}) FROM page_rows), '[]'::jsonb) AS items FROM bounds`);
  res.setHeader("Cache-Control", "private, no-store");
  return res.json(result.rows[0]);
}
