import { sql } from "drizzle-orm";
export function adminMonthlyRevenueSql() {
  return sql`
    SELECT TO_CHAR(DATE_TRUNC('month', os.created_at), 'YYYY-MM') AS month,
           SUM(sp.price) AS total
    FROM owner_subscriptions os
    LEFT JOIN subscription_plans sp ON sp.slug = os.plan
    WHERE os.payment_status = 'paid'
      AND os.created_at >= NOW() - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', os.created_at)
    ORDER BY DATE_TRUNC('month', os.created_at)
  `;
}
export function adminWeeklyBookingsSql() {
  return sql`
    WITH periods AS (
      SELECT generate_series(
        DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '11 weeks',
        DATE_TRUNC('week', CURRENT_DATE),
        INTERVAL '1 week'
      ) AS period
    ), totals AS (
      SELECT DATE_TRUNC('week', TO_DATE(NULLIF(b.booking_date, ''), 'YYYY-MM-DD')) AS period,
             COUNT(*) AS bookings,
             COALESCE(SUM(
               CASE WHEN b.total_price IS NOT NULL
                 THEN COALESCE(b.deposit_paid, 0)
                   + CASE WHEN b.balance_collected
                       THEN GREATEST(b.total_price - COALESCE(b.deposit_paid, 0), 0)
                       ELSE 0 END
                 ELSE COALESCE(b.revenue_amount, b.deposit_paid, 0)
               END
             ), 0) AS revenue
      FROM owner_bookings b
      WHERE b.cancelled_at IS NULL
        AND b.booking_date IS NOT NULL
        AND b.booking_date <> ''
        AND TO_DATE(b.booking_date, 'YYYY-MM-DD') >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '11 weeks'
      GROUP BY 1
    )
    SELECT TO_CHAR(p.period, 'YYYY-MM-DD') AS period,
           COALESCE(t.bookings, 0)::text AS bookings,
           COALESCE(t.revenue, 0)::text AS revenue
    FROM periods p LEFT JOIN totals t ON t.period = p.period
    ORDER BY p.period
  `;
}
export function adminMonthlyBookingsSql() {
  return sql`
    WITH periods AS (
      SELECT generate_series(
        DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months',
        DATE_TRUNC('month', CURRENT_DATE),
        INTERVAL '1 month'
      ) AS period
    ), totals AS (
      SELECT DATE_TRUNC('month', TO_DATE(NULLIF(b.booking_date, ''), 'YYYY-MM-DD')) AS period,
             COUNT(*) AS bookings,
             COALESCE(SUM(
               CASE WHEN b.total_price IS NOT NULL
                 THEN COALESCE(b.deposit_paid, 0)
                   + CASE WHEN b.balance_collected
                       THEN GREATEST(b.total_price - COALESCE(b.deposit_paid, 0), 0)
                       ELSE 0 END
                 ELSE COALESCE(b.revenue_amount, b.deposit_paid, 0)
               END
             ), 0) AS revenue
      FROM owner_bookings b
      WHERE b.cancelled_at IS NULL
        AND b.booking_date IS NOT NULL
        AND b.booking_date <> ''
        AND TO_DATE(b.booking_date, 'YYYY-MM-DD') >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
      GROUP BY 1
    )
    SELECT TO_CHAR(p.period, 'YYYY-MM') AS period,
           COALESCE(t.bookings, 0)::text AS bookings,
           COALESCE(t.revenue, 0)::text AS revenue
    FROM periods p LEFT JOIN totals t ON t.period = p.period
    ORDER BY p.period
  `;
}
