import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it,
} from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import { createSession } from "../lib/auth";
import {
  db,
  pool,
  serviceAppointmentsTable,
  serviceProvidersTable,
  sessionsTable,
} from "@workspace/db";

const TEST_DATES = {
  full: "2030-06-15",
  available: "2030-06-16",
} as const;

type TestAppointment = {
  id: number;
  dateStr: string;
  status: string;
  clientName: string;
};

let server: Server;
let baseUrl: string;
let testProviderIds: number[] = [];
let testSessionIds: string[] = [];
let ownerId: string;
let sessionId: string;
let providerId: number;

async function listen(serverToStart: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    serverToStart.once("error", reject);
    serverToStart.listen(0, "127.0.0.1", () => resolve());
  });
  const address = serverToStart.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function createProvider(dailyCapacity = 1): Promise<number> {
  const [provider] = await db
    .insert(serviceProvidersTable)
    .values({
      ownerId,
      businessName: `اختبار مزود ${randomUUID()}`,
      category: "test",
      city: "القصيم",
      whatsappNumber: "0500000000",
      galleryPhotos: [],
      coverageTags: [],
      customFeatureTags: [],
      photoCaptions: [],
      dailyCapacity,
      isActive: true,
    })
    .returning({ id: serviceProvidersTable.id });

  assert(provider);
  testProviderIds.push(provider.id);
  return provider.id;
}

async function requestAppointment(
  targetProviderId: number,
  method: "POST" | "PATCH" | "DELETE",
  pathSuffix = "",
  body?: Record<string, unknown>,
): Promise<{ response: Response; json: any }> {
  const response = await fetch(
    `${baseUrl}/api/providers/my/approved/${targetProviderId}/appointments${pathSuffix}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${sessionId}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  const json = await response.json();
  return { response, json };
}

function appointmentBody(
  dateStr: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    clientName: "عميل الاختبار",
    dateStr,
    ...overrides,
  };
}

before(async () => {
  server = createServer(app);
  baseUrl = await listen(server);
});

beforeEach(async () => {
  ownerId = `provider-route-test-${randomUUID()}`;
  const session = await createSession({
    user: {
      id: ownerId,
      email: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
    },
    access_token: "integration-test",
  });
  sessionId = session;
  testSessionIds.push(session);
  providerId = await createProvider();
});

afterEach(async () => {
  if (testProviderIds.length > 0) {
    await db
      .delete(serviceAppointmentsTable)
      .where(inArray(serviceAppointmentsTable.providerId, testProviderIds));
    await db
      .delete(serviceProvidersTable)
      .where(inArray(serviceProvidersTable.id, testProviderIds));
  }
  if (testSessionIds.length > 0) {
    await db
      .delete(sessionsTable)
      .where(inArray(sessionsTable.sid, testSessionIds));
  }
  testProviderIds = [];
  testSessionIds = [];
});

after(async () => {
  const pauseAlertTimer = (
    globalThis as typeof globalThis & {
      __takyaPauseAlertTimer?: ReturnType<typeof setInterval>;
    }
  ).__takyaPauseAlertTimer;
  if (pauseAlertTimer) clearInterval(pauseAlertTimer);

  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await pool.end();
});

describe("service appointment capacity and isolation", () => {
  it("persists receipt client details and clears identity when insurance is disabled", async () => {
    await db
      .update(serviceProvidersTable)
      .set({ requiresInsurance: true, insuranceAmount: "500" })
      .where(eq(serviceProvidersTable.id, providerId));

    const created = await requestAppointment(
      providerId,
      "POST",
      "",
      appointmentBody(TEST_DATES.available, {
        clientPhone: "0501234567",
        serviceAddress: "قاعة النخيل - حي الريان",
        clientIdNumber: "1098765432",
      }),
    );

    assert.equal(created.response.status, 201);
    assert.equal(created.json.clientPhone, "0501234567");
    assert.equal(created.json.serviceAddress, "قاعة النخيل - حي الريان");
    assert.equal(created.json.clientIdNumber, "1098765432");
    assert.equal(created.json.insuranceAmount, "500.00");

    await db
      .update(serviceProvidersTable)
      .set({ requiresInsurance: false, insuranceAmount: null })
      .where(eq(serviceProvidersTable.id, providerId));

    const updated = await requestAppointment(
      providerId,
      "PATCH",
      `/${created.json.id}`,
      { clientIdNumber: "1111111111" },
    );

    assert.equal(updated.response.status, 200);
    assert.equal(updated.json.clientIdNumber, null);
    assert.equal(updated.json.serviceAddress, "قاعة النخيل - حي الريان");
  });

  it("allows only one of two concurrent requests to take the last seat", async () => {
    const results = await Promise.all([
      requestAppointment(
        providerId,
        "POST",
        "",
        appointmentBody(TEST_DATES.full, { clientName: "الطلب الأول" }),
      ),
      requestAppointment(
        providerId,
        "POST",
        "",
        appointmentBody(TEST_DATES.full, { clientName: "الطلب الثاني" }),
      ),
    ]);

    assert.deepEqual(
      results.map(({ response }) => response.status).sort((a, b) => a - b),
      [201, 409],
    );
    assert.equal(
      results.filter(({ response }) => response.status === 201).length,
      1,
    );

    const appointments = await db
      .select()
      .from(serviceAppointmentsTable)
      .where(eq(serviceAppointmentsTable.providerId, providerId));
    assert.equal(appointments.length, 1);
    assert.equal(appointments[0]?.dateStr, TEST_DATES.full);
  });

  it("rejects creation, moving, and reactivation when the target date is full", async () => {
    const first = await requestAppointment(
      providerId,
      "POST",
      "",
      appointmentBody(TEST_DATES.full, { clientName: "الحجز الممتلئ" }),
    );
    assert.equal(first.response.status, 201);

    const duplicate = await requestAppointment(
      providerId,
      "POST",
      "",
      appointmentBody(TEST_DATES.full, { clientName: "حجز زائد" }),
    );
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.json.code, "DAILY_CAPACITY_REACHED");

    const movable = await requestAppointment(
      providerId,
      "POST",
      "",
      appointmentBody(TEST_DATES.available, { clientName: "حجز قابل للنقل" }),
    );
    assert.equal(movable.response.status, 201);
    const movableId = (movable.json as TestAppointment).id;

    const moveToFullDate = await requestAppointment(
      providerId,
      "PATCH",
      `/${movableId}`,
      { dateStr: TEST_DATES.full },
    );
    assert.equal(moveToFullDate.response.status, 409);
    assert.equal(moveToFullDate.json.code, "DAILY_CAPACITY_REACHED");

    const cancelled = await requestAppointment(
      providerId,
      "POST",
      "",
      appointmentBody(TEST_DATES.full, {
        clientName: "حجز ملغى",
        status: "cancelled",
      }),
    );
    assert.equal(cancelled.response.status, 201);
    const cancelledId = (cancelled.json as TestAppointment).id;

    const reactivate = await requestAppointment(
      providerId,
      "PATCH",
      `/${cancelledId}`,
      { status: "confirmed" },
    );
    assert.equal(reactivate.response.status, 409);
    assert.equal(reactivate.json.code, "DAILY_CAPACITY_REACHED");

    const appointments = await db
      .select()
      .from(serviceAppointmentsTable)
      .where(eq(serviceAppointmentsTable.providerId, providerId));
    const savedMovable = appointments.find(({ id }) => id === movableId);
    const savedCancelled = appointments.find(({ id }) => id === cancelledId);
    assert.equal(savedMovable?.dateStr, TEST_DATES.available);
    assert.equal(savedCancelled?.status, "cancelled");
  });

  it("rejects invalid or non-canonical Gregorian dates on create and update", async () => {
    const invalidDates = [
      "2030-02-30",
      "2030-2-03",
      "٢٠٣٠-٠٢-٠٣",
      "2030-02-03 ",
    ];

    for (const dateStr of invalidDates) {
      const created = await requestAppointment(
        providerId,
        "POST",
        "",
        appointmentBody(dateStr),
      );
      assert.equal(created.response.status, 422, dateStr);
    }

    const valid = await requestAppointment(
      providerId,
      "POST",
      "",
      appointmentBody(TEST_DATES.available),
    );
    assert.equal(valid.response.status, 201);
    const appointmentId = (valid.json as TestAppointment).id;

    for (const dateStr of invalidDates) {
      const updated = await requestAppointment(
        providerId,
        "PATCH",
        `/${appointmentId}`,
        { dateStr },
      );
      assert.equal(updated.response.status, 422, dateStr);
    }
  });

  it("does not update or delete an appointment through another provider id", async () => {
    const otherProviderId = await createProvider();
    const created = await requestAppointment(
      providerId,
      "POST",
      "",
      appointmentBody(TEST_DATES.available, { clientName: "الحجز الأصلي" }),
    );
    assert.equal(created.response.status, 201);
    const appointmentId = (created.json as TestAppointment).id;

    const updateThroughOtherProvider = await requestAppointment(
      otherProviderId,
      "PATCH",
      `/${appointmentId}`,
      { clientName: "تعديل غير مسموح" },
    );
    assert.equal(updateThroughOtherProvider.response.status, 404);

    const deleteThroughOtherProvider = await requestAppointment(
      otherProviderId,
      "DELETE",
      `/${appointmentId}`,
    );
    assert.equal(deleteThroughOtherProvider.response.status, 404);

    const [saved] = await db
      .select()
      .from(serviceAppointmentsTable)
      .where(and(
        eq(serviceAppointmentsTable.id, appointmentId),
        eq(serviceAppointmentsTable.providerId, providerId),
      ));
    assert.equal(saved?.clientName, "الحجز الأصلي");
  });
});