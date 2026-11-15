import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool, chaletSubmissionsTable, ownerBookingsTable, ownerCustomersTable, sessionsTable } from "@workspace/db";
import app from "../app";
import { createSession } from "../lib/auth";

const ownerId = `property-contract-fixture-${randomUUID()}`;
const otherOwnerId = `${ownerId}-other`;
const propertyIds: number[] = [];
const bookingIds: number[] = [];
let sessionId = "";
let applicationId: number | undefined;
let server: Server;
let origin = "";

before(async () => {
  const application = await db.execute<{ id: number }>(sql`
    INSERT INTO owner_applications
      (full_name, business_name, business_type, phone, email, password_hash, status, email_verified, phone_verified, phone_verified_at)
    VALUES ('مالك اختبار العقد', 'نشاط اختبار', 'chalet', ${`055${randomInt(1000000, 9999999)}`},
      ${`${ownerId}@example.invalid`}, '', 'approved', true, true, now())
    RETURNING id
  `);
  applicationId = application.rows[0].id;
  await db.execute(sql`INSERT INTO owner_account_links (user_id, owner_application_id) VALUES (${ownerId}, ${applicationId})`);
  sessionId = await createSession({
    user: { id: ownerId, email: null, firstName: "اختبار", lastName: null, profileImageUrl: null },
    access_token: "isolated-contract-fixture",
  });
  for (const label of ["الأول", "الثاني"]) {
    const [property] = await db.insert(chaletSubmissionsTable).values({
      ownerId, nameAr: `عقار اختبار ${label}`, whatsappNumber: "0500000011",
      location: "بريدة", district: "حي اختبار", status: "approved", descriptionAr: "عقار اختبار معزول",
      pricePerNight: "1200.75", photos: ["/test-photo.jpg"], termsAndConditions: `شروط العقار ${label} فقط`,
    }).returning({ id: chaletSubmissionsTable.id });
    propertyIds.push(property.id);
    const [booking] = await db.insert(ownerBookingsTable).values({
      ownerId, submissionId: property.id, clientName: "عميل اختبار", bookingDate: "2030-06-15",
      totalPrice: "1200.75", depositPaid: "300.25", insuranceFee: "125.50",
    }).returning({ id: ownerBookingsTable.id });
    bookingIds.push(booking.id);
  }
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}/api/owner`;
});

after(async () => {
  await db.delete(ownerBookingsTable).where(inArray(ownerBookingsTable.ownerId, [ownerId, otherOwnerId]));
  await db.delete(ownerCustomersTable).where(inArray(ownerCustomersTable.ownerId, [ownerId, otherOwnerId]));
  if (propertyIds.length) await db.delete(chaletSubmissionsTable).where(inArray(chaletSubmissionsTable.id, propertyIds));
  if (sessionId) await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
  await db.execute(sql`DELETE FROM owner_account_links WHERE user_id = ${ownerId}`);
  if (applicationId) await db.execute(sql`DELETE FROM owner_applications WHERE id = ${applicationId}`);
  server?.closeAllConnections();
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await pool.end();
});

async function contract(index: number) {
  const response = await fetch(`${origin}/contract/${bookingIds[index]}`);
  assert.equal(response.status, 200);
  return await response.json() as Record<string, unknown>;
}

test("public contracts fetch their linked property's current saved terms without invented conditions", async () => {
  assert.equal((await contract(0)).contractTerms, "شروط العقار الأول فقط");
  assert.equal((await contract(1)).contractTerms, "شروط العقار الثاني فقط");
  const edited = "شروط مخصصة جديدة\nتسوية المصروفات حسب الاتفاق فقط";
  const response = await fetch(`${origin}/submissions/${propertyIds[0]}`, {
    method: "PATCH", headers: { Authorization: `Bearer ${sessionId}`, "Content-Type": "application/json" },
    body: JSON.stringify({ termsAndConditions: edited }),
  });
  assert.equal(response.status, 200);
  const updated = await contract(0);
  assert.equal(updated.contractTerms, edited);
  assert.equal(updated.totalPrice, "1200.75");
  assert.equal(updated.depositPaid, "300.25");
  assert.equal((await contract(1)).contractTerms, "شروط العقار الثاني فقط");

  const cleared = await fetch(`${origin}/submissions/${propertyIds[0]}`, {
    method: "PATCH", headers: { Authorization: `Bearer ${sessionId}`, "Content-Type": "application/json" },
    body: JSON.stringify({ termsAndConditions: null }),
  });
  assert.equal(cleared.status, 200);
  assert.equal((await contract(0)).contractTerms, null);
});

test("contract autofill restores only this owner's customer identity and normalized signing history", async () => {
  const phone = "0500000011";
  await db.update(ownerBookingsTable).set({ clientPhone: "٠٥٠٠٠٠٠٠١١" }).where(eq(ownerBookingsTable.id, bookingIds[0]));
  await db.insert(ownerCustomersTable).values({
    ownerId: otherOwnerId, phoneNormalized: phone, phone, name: "عميل تاجر آخر", clientIdNumber: "9999999999",
  });
  await db.insert(ownerBookingsTable).values({
    ownerId: otherOwnerId, clientName: "عميل آخر", clientPhone: phone, bookingDate: "2030-06-01",
    contractSigned: true, contractSignerName: "موقّع تاجر آخر", contractSignerId: "9999999999",
    contractSignedAt: new Date("2030-06-02T12:00:00Z"),
  });
  const fresh = await contract(0);
  assert.equal(fresh.clientName, "عميل اختبار");
  assert.equal(fresh.prevSignerName, null);
  assert.equal(fresh.prevSignerId, null);

  await db.insert(ownerCustomersTable).values({
    ownerId, phoneNormalized: phone, phone, name: "الاسم الكامل المحفوظ", clientIdNumber: "1000000001",
  });
  const known = await contract(0);
  assert.equal(known.prevSignerName, "الاسم الكامل المحفوظ");
  assert.equal(known.prevSignerId, "1000000001");

  await db.update(ownerBookingsTable).set({
    clientPhone: "+966500000011", contractSigned: true, contractSignerName: "الاسم من العقد السابق",
    contractSignerId: "2000000002", contractSignedAt: new Date("2030-06-01T12:00:00Z"),
  }).where(eq(ownerBookingsTable.id, bookingIds[1]));
  const returning = await contract(0);
  assert.equal(returning.prevSignerName, "الاسم من العقد السابق");
  assert.equal(returning.prevSignerId, "2000000002");

  await db.update(ownerBookingsTable).set({ clientPhone: null }).where(eq(ownerBookingsTable.id, bookingIds[0]));
  const withoutPhone = await contract(0);
  assert.equal(withoutPhone.prevSignerName, null);
  assert.equal(withoutPhone.prevSignerId, null);
});
