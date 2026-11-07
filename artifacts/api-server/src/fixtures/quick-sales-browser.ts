import { insertRecords } from "@workspace/db/mutations";
import { ownerApplicationsQueryTable } from "@workspace/db/runtime-models";
// Synthetic browser-test fixture. Credentials stay in /tmp, never in the repository or output.
import { randomUUID } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool, ownerAccountLinksTable, ownerSubscriptionsTable, serviceProvidersTable, serviceAppointmentsTable, sessionsTable, quickSalesTable, quickSalesSettingsTable, providerCatalogItemsTable, ownerCustomersTable, ownerNotificationsTable } from "@workspace/db";
import { createSession } from "../lib/auth";

const path = "/tmp/quick-sales-browser.json";
try {
  if (process.argv[2] === "cleanup") {
    const fixture = JSON.parse(await readFile(path, "utf8"));
    const [identity] = await db.select({ name: serviceProvidersTable.businessName }).from(serviceProvidersTable).where(eq(serviceProvidersTable.id, fixture.providerIds[0]));
    if (!identity?.name.startsWith("اختبار المبيعات المفردة")) throw new Error("Fixture identity mismatch; refusing cleanup");
    await db.transaction(async tx => {
      await tx.delete(quickSalesTable).where(eq(quickSalesTable.ownerId, fixture.ownerId));
      await tx.delete(quickSalesSettingsTable).where(eq(quickSalesSettingsTable.ownerId, fixture.ownerId));
      await tx.delete(serviceAppointmentsTable).where(eq(serviceAppointmentsTable.ownerId, fixture.ownerId));
      await tx.delete(serviceProvidersTable).where(and(eq(serviceProvidersTable.ownerId, fixture.ownerId), inArray(serviceProvidersTable.id, fixture.providerIds)));
      await tx.delete(ownerCustomersTable).where(eq(ownerCustomersTable.ownerId, fixture.ownerId));
      await tx.delete(ownerNotificationsTable).where(eq(ownerNotificationsTable.ownerId, fixture.ownerId));
      await tx.delete(ownerSubscriptionsTable).where(eq(ownerSubscriptionsTable.ownerId, fixture.ownerId));
      await tx.delete(ownerAccountLinksTable).where(eq(ownerAccountLinksTable.userId, fixture.ownerId));
      await tx.delete(sessionsTable).where(eq(sessionsTable.sid, fixture.sid));
      await tx.execute(sql`DELETE FROM owner_applications WHERE id = ${fixture.applicationId} AND email = ${fixture.email}`);
    });
    await unlink(path);
    process.stdout.write("Removed synthetic quick-sales browser fixture.\n");
  } else {
    const email = `quick-sales-browser-${randomUUID()}@example.test`;
    const [inserted] = await insertRecords(db, ownerApplicationsQueryTable, {
      fullName: "اختبار المبيعات المفردة", businessName: "اختبار المبيعات المفردة",
      phone: "0500000000", email, passwordHash: "!browser-fixture-no-password",
      status: "approved", businessType: "service", emailVerified: true,
    }, { returning: { id: ownerApplicationsQueryTable.id } });
    const applicationId = inserted.id;
    const ownerId = `owner_${applicationId}`;
    const sid = await createSession({
      user: { id: ownerId, email, firstName: "اختبار المبيعات المفردة", lastName: "", profileImageUrl: null }, access_token: "",
    });
    const providerIds: number[] = [];
    for (const number of [1, 2]) {
      const [provider] = await insertRecords(db, serviceProvidersTable, {
        ownerId, businessName: `اختبار المبيعات المفردة ${number}`, category: "cake", city: "بريدة", whatsappNumber: "0500000000",
      });
      providerIds.push(provider.id);
    }
    await db.insert(ownerSubscriptionsTable).values({ ownerId, status: "active", expiresAt: new Date(Date.now() + 86400000) });
    const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    await db.insert(serviceAppointmentsTable).values({
      ownerId, providerId: providerIds[0], clientName: "حجز اختباري مستقل", dateStr, amount: "100", deposit: "40",
    });
    await db.insert(providerCatalogItemsTable).values({
      providerId: providerIds[0], name: "منتج اختباري سريع", kind: "product", price: "10.15", pricingUnit: "per_piece",
    });
    await writeFile(path, JSON.stringify({ ownerId, email, applicationId, sid, providerIds, dateStr }), { mode: 0o600 });
    process.stdout.write(`Synthetic fixture ready. Provider IDs: ${providerIds.join(", ")}. Session only in ${path}.\n`);
  }
} finally {
  await pool.end();
}
