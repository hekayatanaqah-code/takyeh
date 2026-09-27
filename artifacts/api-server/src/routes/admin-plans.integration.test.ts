import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import app from "../app";
import { createSession } from "../lib/auth";
import { db, pool, sessionsTable } from "@workspace/db";

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
      body: JSON.stringify({ nameAr, price: 99, durationDays: 90, features: [] }),
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