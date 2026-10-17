import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool, chaletSubmissionsTable, ownerBookingsTable, sessionsTable } from "@workspace/db";
import app from "../app";
import { createSession } from "../lib/auth";

const ownerId = `property-contract-fixture-${randomUUID()}`;
const propertyIds: number[] = [];
const bookingIds: number[] = [];
let sessionId = "";
let server: Server;
let origin = "";

before(async () => {
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
  await db.delete(ownerBookingsTable).where(eq(ownerBookingsTable.ownerId, ownerId));
  if (propertyIds.length) await db.delete(chaletSubmissionsTable).where(inArray(chaletSubmissionsTable.id, propertyIds));
  if (sessionId) await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
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
