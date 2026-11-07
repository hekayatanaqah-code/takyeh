import { sql,type SQL } from "drizzle-orm";

export function adminMonthlyRevenueSql() {
  return sql`SELECT DATE_FORMAT(os.created_at,'%Y-%m') AS month,SUM(sp.price) AS total
    FROM owner_subscriptions os LEFT JOIN subscription_plans sp ON sp.slug=os.plan
    WHERE os.payment_status='paid' AND os.created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 12 MONTH)
    GROUP BY DATE_FORMAT(os.created_at,'%Y-%m') ORDER BY month`;
}
function bookingDate(): SQL {
  const raw = sql`NULLIF(b.booking_date,'')`;
  const valid = sql`${raw} REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
    AND LEFT(${raw},4)<>'0000'
    AND CAST(RIGHT(${raw},2) AS UNSIGNED)<=DAY(LAST_DAY(CONCAT(LEFT(${raw},7),'-01')))`;
  // Never turn malformed dates into missing revenue. PostgreSQL's date parser
  // also rejects invalid calendar days; preserve that explicit failure.
  return sql`CASE WHEN ${raw} IS NULL THEN NULL WHEN ${valid} THEN STR_TO_DATE(${raw},'%Y-%m-%d')
    ELSE (SELECT invalid_booking_date FROM (SELECT 1 AS invalid_booking_date UNION ALL SELECT 2) invalid_date) END`;
}
function startOf(value: SQL,kind:"week"|"month"): SQL {
  return kind==="week" ? sql`DATE_SUB(DATE(${value}),INTERVAL WEEKDAY(${value}) DAY)`
    : sql`DATE_SUB(DATE(${value}),INTERVAL (DAYOFMONTH(${value})-1) DAY)`;
}
function performance(kind:"week"|"month") {
  const current = startOf(sql`CURRENT_DATE`,kind);
  const first = kind==="week" ? sql`DATE_SUB(${current},INTERVAL 11 WEEK)` : sql`DATE_SUB(${current},INTERVAL 11 MONTH)`;
  const next = kind==="week" ? sql`DATE_ADD(p.period,INTERVAL 1 WEEK)` : sql`DATE_ADD(p.period,INTERVAL 1 MONTH)`;
  const date = bookingDate(),period = startOf(date,kind),format=kind==="week" ? "%Y-%m-%d" : "%Y-%m";
  return sql`WITH RECURSIVE periods AS (
    SELECT ${first} AS period UNION ALL SELECT ${next} FROM periods p WHERE p.period<${current}
  ),totals AS (
    SELECT ${period} AS period,COUNT(*) AS bookings,COALESCE(SUM(
      CASE WHEN b.total_price IS NOT NULL THEN COALESCE(b.deposit_paid,0)
        +CASE WHEN b.balance_collected THEN GREATEST(b.total_price-COALESCE(b.deposit_paid,0),0) ELSE 0 END
      ELSE COALESCE(b.revenue_amount,b.deposit_paid,0) END),0) AS revenue
    FROM owner_bookings b WHERE b.cancelled_at IS NULL AND b.booking_date IS NOT NULL
      AND b.booking_date<>'' AND ${date}>=${first} GROUP BY 1
  ) SELECT DATE_FORMAT(p.period,${format}) AS period,CAST(COALESCE(t.bookings,0) AS CHAR) AS bookings,
    CAST(COALESCE(t.revenue,0) AS CHAR) AS revenue
    FROM periods p LEFT JOIN totals t ON t.period=p.period ORDER BY p.period`;
}
export function adminWeeklyBookingsSql() { return performance("week"); }
export function adminMonthlyBookingsSql() { return performance("month"); }
