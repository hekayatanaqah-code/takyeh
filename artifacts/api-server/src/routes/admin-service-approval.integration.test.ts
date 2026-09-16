import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import app from "../app";
import { createSession } from "../lib/auth";
import {
  db,
  pool,
  serviceProviderSubmissionsTable,
  serviceProvidersTable,
  sessionsTable,
} from "@workspace/db";

let server: Server;
let baseUrl: string;
let sessionId: string;
const submissionIds: number[] = [];
const providerIds: number[] = [];
const originalAdminUserId = process.env.ADMIN_USER_ID;
const testAdminId = `service-approval-admin-${randomUUID()}`;

async function listen(serverToStart: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    serverToStart.once("error", reject);
    serverToStart.listen(0, "127.0.0.1", () => resolve());
  });
  const address = serverToStart.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function createSubmission() {
  const identity = randomUUID();
  const [submission] = await db
    .insert(serviceProviderSubmissionsTable)
    .values({
      ownerId: `service-owner-${identity}`,
      businessName: `مزود اختبار ${identity}`,
      category: "test",
      city: "القصيم",
      whatsappNumber: "0500000000",
    })
    .returning();
  submissionIds.push(submission.id);
  return submission;
}

async function approve(submissionId: number) {
  return fetch(`${baseUrl}/api/admin/service-submissions/${submissionId}/status`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${sessionId}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ status: "approved" }),
  });
}

before(async () => {
  process.env.ADMIN_USER_ID = testAdminId;
  sessionId = await createSession({
    user: {
      id: testAdminId,
      email: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
    },
    access_token: "integration-test",
  });
  server = createServer(app);
  baseUrl = await listen(server);
});

after(async () => {
  for (const providerId of providerIds) {
    await db.delete(serviceProvidersTable).where(eq(serviceProvidersTable.id, providerId));
  }
  for (const submissionId of submissionIds) {
    await db
      .delete(serviceProviderSubmissionsTable)
      .where(eq(serviceProviderSubmissionsTable.id, submissionId));
  }
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));

  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await pool.end();

  if (originalAdminUserId === undefined) {
    delete process.env.ADMIN_USER_ID;
  } else {
    process.env.ADMIN_USER_ID = originalAdminUserId;
  }
});

describe("service provider approval idempotency", () => {
  it("creates one provider when the same approval is submitted concurrently", async () => {
    const submission = await createSubmission();
    const responses = await Promise.all([
      approve(submission.id),
      approve(submission.id),
      approve(submission.id),
    ]);
    assert.deepEqual(responses.map((response) => response.status), [200, 200, 200]);

    const providers = await db
      .select()
      .from(serviceProvidersTable)
      .where(eq(serviceProvidersTable.submissionId, submission.id));
    assert.equal(providers.length, 1);
    providerIds.push(providers[0].id);

    const [updatedSubmission] = await db
      .select()
      .from(serviceProviderSubmissionsTable)
      .where(eq(serviceProviderSubmissionsTable.id, submission.id));
    assert.equal(updatedSubmission.status, "approved");
  });

  it("links the existing legacy provider instead of creating a duplicate", async () => {
    const submission = await createSubmission();
    const [legacyProvider] = await db
      .insert(serviceProvidersTable)
      .values({
        ownerId: submission.ownerId,
        businessName: submission.businessName,
        category: submission.category,
        city: submission.city,
        whatsappNumber: submission.whatsappNumber,
      })
      .returning();
    providerIds.push(legacyProvider.id);

    const response = await approve(submission.id);
    assert.equal(response.status, 200);

    const matchingProviders = await db
      .select()
      .from(serviceProvidersTable)
      .where(eq(serviceProvidersTable.businessName, submission.businessName));
    assert.equal(matchingProviders.length, 1);
    assert.equal(matchingProviders[0].id, legacyProvider.id);
    assert.equal(matchingProviders[0].submissionId, submission.id);

    const deleteResponse = await fetch(
      `${baseUrl}/api/admin/service-submissions/${submission.id}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${sessionId}` },
      },
    );
    assert.equal(deleteResponse.status, 200);

    const [providerAfterSubmissionDelete] = await db
      .select()
      .from(serviceProvidersTable)
      .where(eq(serviceProvidersTable.id, legacyProvider.id));
    assert.equal(providerAfterSubmissionDelete.submissionId, null);
  });
});