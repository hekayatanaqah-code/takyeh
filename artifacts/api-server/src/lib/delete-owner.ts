import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";

export class OwnerDeletionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Identifiers come from the schema/our own manifest, never from request input.
const identifier = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("Invalid deletion identifier");
  return sql.raw(`"${name}"`);
};
const anyOf = (column: string, values: Array<string | number>): SQL =>
  values.length
    ? sql`${identifier(column)} IN (${sql.join(values.map(value => sql`${value}`), sql`, `)})`
    : sql`false`;

/** Permanent owner-scoped deletion. Keep shared catalogs, other roles and the admin audit trail. */
export async function deleteOwnerPermanently(rawId: string) {
  return db.transaction(async tx => {
    const reserved = /^owner_([1-9]\d*)$/.exec(rawId);
    let applicationId = reserved ? Number(reserved[1]) : undefined;
    if (!reserved) {
      const linked = await tx.execute<{ owner_application_id: number }>(sql`
        SELECT owner_application_id FROM owner_account_links WHERE user_id = ${rawId} LIMIT 1`);
      applicationId = linked.rows[0]?.owner_application_id;
    }
    const account = applicationId ? await tx.execute<{ id: number; email: string | null; phone: string }>(sql`
      SELECT id, email, phone FROM owner_applications WHERE id = ${applicationId} FOR UPDATE`) : null;
    const links = applicationId ? await tx.execute<{ user_id: string }>(sql`
      SELECT user_id FROM owner_account_links WHERE owner_application_id = ${applicationId} FOR UPDATE`) : null;
    // A reserved owner_N alias never authorizes deletion of another application's data.
    const aliases = [...new Set([
      rawId, ...(applicationId ? [`owner_${applicationId}`] : []),
      ...(links?.rows.map(row => row.user_id).filter(id => !/^owner_\d+$/.test(id)) ?? []),
    ])];
    const protectedIds = new Set([process.env.ADMIN_USER_ID, ...(process.env.PLATFORM_ADMIN_IDS ?? "56719001").split(",")]
      .filter(Boolean).map(id => id!.trim()));
    if (aliases.some(id => protectedIds.has(id))) {
      throw new OwnerDeletionError(403, "لا يمكن حذف حساب الإدارة من قائمة الملاك");
    }
    const metadata = await tx.execute<{ table_name: string; column_name: string }>(sql`
      SELECT c.table_name, c.column_name FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'`);
    const columns = new Map<string, Set<string>>();
    for (const row of metadata.rows) {
      if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
      columns.get(row.table_name)!.add(row.column_name);
    }
    const predicates = new Map<string, SQL[]>();
    const add = (table: string, column: string, values: Array<string | number>) => {
      if (!values.length || !columns.get(table)?.has(column)) return;
      predicates.set(table, [...(predicates.get(table) ?? []), anyOf(column, values)]);
    };
    // Include owner-scoped tables even when they have no declared foreign key.
    for (const [table, fields] of columns) if (fields.has("owner_id")) add(table, "owner_id", aliases);
    const ids = async (table: string, extraColumn?: string, extraIds: number[] = []): Promise<number[]> => {
      if (extraColumn) add(table, extraColumn, extraIds);
      const conditions = predicates.get(table);
      if (!conditions?.length) return [];
      const result = await tx.execute<{ id: number }>(sql`
        SELECT id FROM ${identifier(table)} WHERE (${sql.join(conditions, sql` OR `)}) FOR UPDATE`);
      return result.rows.map(row => row.id);
    };
    const submissions = await ids("chalet_submissions");
    const serviceSubmissions = await ids("service_provider_submissions");
    const chalets = await ids("chalets", "submission_id", submissions);
    const providers = await ids("service_providers", "submission_id", serviceSubmissions);
    const bookings = await ids("owner_bookings", "submission_id", submissions);
    const staff = await ids("owner_staff");
    const invoices = await ids("subscription_renewal_invoices");
    // Snapshot relationships before any parent is removed (including legacy null-owner mirrors).
    for (const table of ["chalet_availability", "chalet_services", "reviews", "review_invitations", "owner_notifications"]) add(table, "chalet_id", chalets);
    for (const table of ["chalet_seasons", "chalet_global_seasons", "property_offers", "owner_expenses", "cash_deposit_logs", "owner_report_archive"]) add(table, "submission_id", submissions);
    for (const table of ["provider_catalog_items", "provider_offers", "quick_sales", "service_appointments", "service_blocked_dates", "service_insurances", "service_review_invitations", "service_reviews", "service_seasons", "owner_expenses"]) add(table, "provider_id", providers);
    for (const table of ["booking_payments", "owner_refunds", "owner_reschedule_logs", "cash_deposit_logs", "owner_notifications", "review_invitations"]) add(table, "booking_id", bookings);
    for (const table of ["salary_logs", "staff_holdings", "staff_sessions"]) add(table, "staff_id", staff);
    add("subscription_renewal_attempts", "invoice_id", invoices);
    add("service_city_requests", "requester_id", aliases);
    add("broadcast_deliveries", "recipient_owner_id", aliases);
    const broadcastKeys = [...aliases, ...aliases.map(id => `user:${id}`), ...(applicationId ? [`app:${applicationId}`] : [])];
    add("owner_broadcast_preferences", "owner_key", broadcastKeys);
    add("broadcast_deliveries", "recipient_key", broadcastKeys);
    add("users", "id", aliases);
    if (applicationId) add("owner_account_links", "owner_application_id", [applicationId]);
    const owner = account?.rows[0];
    if (owner) {
      // Legacy owners may share a destination; don't invalidate the surviving account's OTP.
      const sharedPhone = await tx.execute(sql`SELECT 1 FROM owner_applications
        WHERE id <> ${owner.id} AND phone = ${owner.phone} LIMIT 1`);
      if (owner.phone && !sharedPhone.rows.length) add("phone_otp_tokens", "phone", [owner.phone]);
      if (owner.email) {
        const sharedEmail = await tx.execute(sql`SELECT 1 FROM owner_applications
          WHERE id <> ${owner.id} AND LOWER(email) = LOWER(${owner.email}) LIMIT 1`);
        if (!sharedEmail.rows.length) add("owner_otp_tokens", "email", [owner.email]);
      }
    }
    if (columns.has("password_reset_tokens")) {
      predicates.set("password_reset_tokens", [sql`
        (target_type IN ('owner', 'owner_application') AND ${anyOf("target_id", applicationId ? [...aliases, String(applicationId)] : aliases)})
        OR (target_type IN ('staff', 'owner_staff') AND ${anyOf("target_id", staff.map(String))})`]);
    }
    // Delete only owner sessions/challenges, not independent admin or photographer sessions.
    predicates.set("sessions", [sql`
      ${anyOfSessionUser(aliases)} OR
      ${applicationId ? sql`(sess->>'ownerApplicationId') = ${String(applicationId)}` : sql`false`}`]);
    // A missing registration may be the orphan left by the old broken deletion.
    if (!owner) {
      let found = false;
      for (const [table, conditions] of predicates) {
        if (table === "sessions" || table === "password_reset_tokens" || table === "users") continue;
        const rows = await tx.execute(sql`SELECT 1 FROM ${identifier(table)}
          WHERE (${sql.join(conditions, sql` OR `)}) LIMIT 1`);
        if (rows.rows.length) { found = true; break; }
      }
      if (!found) throw new OwnerDeletionError(404, "المالك غير موجود أو تم حذفه مسبقاً");
    }
    // Child-first order supplements database cascades and non-FK relationships.
    const parents = [
      "reviews", "review_invitations", "service_reviews", "service_review_invitations",
      "provider_offers", "provider_catalog_items", "owner_support_requests",
      "photography_bookings", "owner_staff", "owner_bookings", "chalets",
      "service_providers", "chalet_submissions", "service_provider_submissions",
      "subscription_renewal_invoices", "owner_account_links", "users",
    ];
    const order = [...predicates.keys()].filter(table => !parents.includes(table)).concat(parents);
    for (const table of order) {
      const conditions = predicates.get(table);
      if (!conditions?.length) continue;
      await tx.execute(sql`DELETE FROM ${identifier(table)} WHERE (${sql.join(conditions, sql` OR `)})`);
    }
    const remaining = await tx.execute(sql`
      SELECT 1 FROM (${sql.join([...predicates].map(([table, conditions]) =>
        sql`(SELECT 1 FROM ${identifier(table)} WHERE (${sql.join(conditions, sql` OR `)}) LIMIT 1)`), sql` UNION ALL `)}) remaining LIMIT 1`);
    if (remaining.rows.length) throw new Error("Related owner records remain after deletion");
    if (applicationId) {
      await tx.execute(sql`DELETE FROM owner_applications WHERE id = ${applicationId}`);
      const remains = await tx.execute(sql`SELECT 1 FROM owner_applications WHERE id = ${applicationId}`);
      if (remains.rows.length) throw new Error("Owner deletion did not complete");
    }
    // Administrative accounts/audit history survive; leave no stale impersonation target.
    await tx.execute(sql`UPDATE admin_sessions SET impersonated_owner_id = NULL
      WHERE ${anyOf("impersonated_owner_id", aliases)}`);
    return { ok: true as const, ownerId: rawId, permanentlyDeleted: true as const };
  });
}

function anyOfSessionUser(aliases: string[]) {
  return sql`(sess->'user'->>'id') IN (${sql.join(aliases.map(id => sql`${id}`), sql`, `)})`;
}
