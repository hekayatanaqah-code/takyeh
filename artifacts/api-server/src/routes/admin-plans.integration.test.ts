import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import app from "../app";
import { createSession } from "../lib/auth";
import { db, pool, sessionsTable, subscriptionPlansTable } from "@workspace/db";

let server: Server;
let baseUrl: string;
let sessionId: string;
const ids: number[] = [];
const originalAdminId = process.env.ADMIN_USER_ID;
const adminId = `plans-test-admin-${randomUUID()}`;
const nameAr = `خطة تجريبية ${randomUUID().slice(0, 8)}`;
const headers = () => ({ authorization: `Bearer ${sessionId}`, "content-type": "application/json" });

before(async () => {
  process.env.ADMIN_USER_ID = adminId;
  sessionId = await createSession({
    user: { id: adminId, email: null, firstName: null, lastName: null, profileImageUrl: null },
    access_token: "integration-test",
  });
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  for (const id of ids) {
    await fetch(`${baseUrl}/api/admin/plans/${id}`, { method: "DELETE", headers: headers() });
  }
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
  if (originalAdminId === undefined) delete process.env.ADMIN_USER_ID;
  else process.env.ADMIN_USER_ID = originalAdminId;
});

test("plan identifiers are derived from Arabic names, unique and stable when renamed", async () => {
  const create = async () => {
    const response = await fetch(`${baseUrl}/api/admin/plans`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        nameAr, price: 99, durationDays: 90, features: [],
        scope: "full", chaletLimit: 1, serviceLimit: 1,
      }),
    });
    assert.equal(response.status, 200);
    const plan = await response.json() as { id: number; slug: string };
    ids.push(plan.id);
    return plan;
  };

  const first = await create();
  assert.ok(first.slug.startsWith("خطة-تجريبية-"));
  const second = await create();
  assert.equal(second.slug, `${first.slug}-2`);

  const updated = await fetch(`${baseUrl}/api/admin/plans/${first.id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ nameAr: "اسم جديد", slug: "changed-by-client" }),
  });
  assert.equal(updated.status, 200);
  const edited = await updated.json() as { slug: string; nameAr: string };
  assert.equal(edited.slug, first.slug);
  assert.equal(edited.nameAr, "اسم جديد");
});

test("trial plan add-on prices are editable independently and visible in the plan catalog", async () => {
  const response = await fetch(`${baseUrl}/api/admin/plans`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      nameAr: `تجربة اختبارية ${randomUUID().slice(0, 8)}`,
      price: 0, durationDays: 30, trialDays: 30, features: [],
      scope: "full", chaletLimit: 1, serviceLimit: 1,
      extraChaletPrice: 35, extraServicePrice: 20, isActive: false,
    }),
  });
  assert.equal(response.status, 200);
  const created = await response.json() as { id: number; extraChaletPrice: string; extraServicePrice: string };
  ids.push(created.id);
  assert.equal(Number(created.extraChaletPrice), 35);
  assert.equal(Number(created.extraServicePrice), 20);

  const update = await fetch(`${baseUrl}/api/admin/plans/${created.id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ extraChaletPrice: 47.5, extraServicePrice: 25 }),
  });
  assert.equal(update.status, 200);
  const saved = await update.json() as { extraChaletPrice: string; extraServicePrice: string };
  assert.equal(Number(saved.extraChaletPrice), 47.5);
  assert.equal(Number(saved.extraServicePrice), 25);

  const listed = await fetch(`${baseUrl}/api/admin/plans`, { headers: headers() });
  assert.equal(listed.status, 200);
  const catalog = await listed.json() as Array<{ id: number; extraChaletPrice: string; extraServicePrice: string }>;
  const plan = catalog.find((item) => item.id === created.id);
  assert.equal(Number(plan?.extraChaletPrice), 47.5);
  assert.equal(Number(plan?.extraServicePrice), 25);
});

test("fixed trial terms cannot be repriced, resized, or deleted by an administrator", async () => {
  const [trial] = await db.select({ id: subscriptionPlansTable.id })
    .from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, "trial")).limit(1);
  assert.ok(trial, "the seeded fixed trial plan should exist");

  for (const changes of [
    { price: 1 },
    { durationDays: 31 },
    { trialDays: 29 },
  ]) {
    const response = await fetch(`${baseUrl}/api/admin/plans/${trial.id}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(changes),
    });
    assert.equal(response.status, 400);
  }

  const deleted = await fetch(`${baseUrl}/api/admin/plans/${trial.id}`, {
    method: "DELETE",
    headers: headers(),
  });
  assert.equal(deleted.status, 409);

  const catalog = await fetch(`${baseUrl}/api/owner/plans`, { headers: headers() });
  assert.equal(catalog.status, 200);
  const purchasable = await catalog.json() as Array<{ id: string }>;
  assert.ok(!purchasable.some((plan) => plan.id === "trial"));

  const retryTrial = await fetch(`${baseUrl}/api/owner/subscription/initiate`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ plan: "trial" }),
  });
  assert.equal(retryTrial.status, 400);
});
