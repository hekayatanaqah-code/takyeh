import type { Request, Response } from "express";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import { GetOwnerCrmCustomersQueryParams } from "@workspace/api-zod";
import { customerPhoneSql } from "../customerPhone";
import { authorizedProvider,booleanValue,checkoutSql,countValue,crmSearch,moneyValue } from "./crm-records";

const PAGE_SIZE = 20;
export async function sendCrmCustomers(req: Request,res: Response) {
  const parsed = GetOwnerCrmCustomersQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "فلاتر قائمة العملاء غير صالحة" });
  const { scope="all",source="all",providerId,sort="activity",page=1 } = parsed.data;
  const ownerId = req.user!.id;
  if (providerId && scope!=="service") return res.status(400).json({ error: "يجب تحديد نطاق الخدمة" });
  if (!await authorizedProvider(ownerId,providerId)) return res.status(404).json({ error: "الخدمة غير موجودة" });
  const now = new Date(),today = now.toLocaleDateString("en-CA",{timeZone:"Asia/Riyadh"});
  const sources: SQL[] = [];
  if (scope!=="service") sources.push(sql`SELECT b.id,b.client_name,COALESCE(b.client_phone,'') AS client_phone,
    b.booking_date,COALESCE(b.total_price,0) AS revenue,'chalet' AS kind,NULL AS provider_name,
    (${now}<${checkoutSql()}) AS is_active FROM owner_bookings b
    WHERE b.owner_id=${ownerId} AND b.cancelled_at IS NULL`);
  if (scope!=="chalet") {
    sources.push(sql`SELECT b.id,b.client_name,COALESCE(b.client_phone,'') AS client_phone,b.date_str AS booking_date,
      CASE WHEN b.cancelled_at IS NOT NULL OR b.status IN ('cancelled','canceled') THEN 0 ELSE COALESCE(b.amount,0) END AS revenue,
      'service' AS kind,p.business_name AS provider_name,
      (b.cancelled_at IS NULL AND b.status NOT IN ('cancelled','canceled','completed') AND b.date_str>=${today}) AS is_active
      FROM service_appointments b JOIN service_providers p ON p.id=b.provider_id
      WHERE b.owner_id=${ownerId} AND p.owner_id=${ownerId} ${providerId ? sql`AND b.provider_id=${providerId}` : sql``}`);
    sources.push(sql`SELECT b.id,b.client_name,b.client_phone,CAST(b.date_str AS CHAR),
      CASE WHEN b.status='cancelled' THEN 0 ELSE b.total END,'quick_sale',b.provider_name,false
      FROM quick_sales b WHERE b.owner_id=${ownerId} AND b.client_phone<>''
      ${providerId ? sql`AND b.provider_id=${providerId}` : sql``}`);
  }
  const search = crmSearch(parsed.data.search??""),phoneSearch = search.replace(/[\s()+.-]/g,"");
  const base = sql`WITH records AS (${sql.join(sources,sql` UNION ALL `)}),
    normalized AS (SELECT id,client_name,${customerPhoneSql(sql`client_phone`)} AS client_phone,
      booking_date,revenue,kind,provider_name,is_active FROM records),
    keyed AS (SELECT *,CASE WHEN TRIM(client_phone)<>'' THEN client_phone ELSE CONCAT('name:',client_name) END AS customer_key FROM normalized),
    identified AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY customer_key ORDER BY booking_date DESC,id DESC,kind) AS name_rank FROM keyed),
    aggregated AS (SELECT customer_key,MAX(CASE WHEN name_rank=1 THEN client_name END) AS client_name,
      MAX(client_phone) AS client_phone,SUM(kind<>'quick_sale') AS total_bookings,SUM(kind='quick_sale') AS total_sales,
      SUM(revenue) AS total_revenue,MAX(booking_date) AS last_booking_date,MAX(is_active) AS has_active,
      CASE WHEN MAX(kind='chalet') AND MAX(kind<>'chalet') THEN 'both'
        WHEN MAX(kind<>'chalet') THEN 'service' ELSE 'chalet' END AS source
      FROM identified GROUP BY customer_key),
    customers AS (SELECT a.*,COALESCE(c.name,a.client_name) AS display_name FROM aggregated a
      LEFT JOIN owner_customers c ON c.owner_id=${ownerId} AND c.phone_normalized=a.client_phone),
    filtered AS (SELECT * FROM customers WHERE true
      ${source==="all" ? sql`` : sql`AND (source=${source} OR source='both')`}
      ${search ? sql`AND (LOCATE(LOWER(${search}),LOWER(display_name))>0
        ${phoneSearch ? sql`OR LOCATE(${phoneSearch},client_phone)>0` : sql``})` : sql``})`;
  const order = sort==="bookings" ? sql`total_bookings DESC,last_booking_date DESC,customer_key`
    : sort==="revenue" ? sql`total_revenue DESC,last_booking_date DESC,customer_key`
    : sql`has_active IS NULL DESC,has_active DESC,last_booking_date DESC,customer_key`;
  const response = await db.transaction(async tx => {
    const counts = (await tx.execute(sql`${base} SELECT COUNT(*) AS total,(SELECT COUNT(*) FROM customers) AS totalCustomers FROM filtered`)).rows[0];
    if (!counts) throw new Error("CRM directory totals are missing.");
    const total = countValue(counts.total),totalCustomers = countValue(counts.totalCustomers);
    const totalPages = Math.max(1,Math.ceil(total/PAGE_SIZE)),selectedPage = Math.min(page,totalPages);
    const rows = (await tx.execute(sql`${base} SELECT * FROM filtered ORDER BY ${order}
      LIMIT ${PAGE_SIZE} OFFSET ${(selectedPage-1)*PAGE_SIZE}`)).rows;
    const keys = rows.map(row => row.customer_key);
    const providers = keys.length ? (await tx.execute(sql`${base} SELECT DISTINCT customer_key,provider_name FROM identified
      WHERE provider_name IS NOT NULL AND customer_key IN (${sql.join(keys.map(key=>sql`${key}`),sql`, `)})
      ORDER BY BINARY provider_name`)).rows : [];
    const names = new Map<unknown,string[]>();
    for (const row of providers) {
      if (typeof row.provider_name!=="string") throw new Error("Invalid CRM provider name.");
      const list = names.get(row.customer_key)??[]; list.push(row.provider_name); names.set(row.customer_key,list);
    }
    const items = rows.map(row => {
      const item: Record<string,unknown> = { ...row,client_name:row.display_name,total_bookings:countValue(row.total_bookings),
        total_sales:countValue(row.total_sales),total_revenue:moneyValue(row.total_revenue),
        has_active:booleanValue(row.has_active),providers:names.get(row.customer_key)??[] };
      delete item.customer_key; delete item.display_name;
      return item;
    });
    return { total,totalCustomers,totalPages,page:selectedPage,pageSize:PAGE_SIZE,items };
  },{isolationLevel:"repeatable read"});
  res.setHeader("Cache-Control","private, no-store");
  return res.json(response);
}
