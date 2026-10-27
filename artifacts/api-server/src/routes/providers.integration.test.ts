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
  serviceBlockedDatesTable,
  serviceProvidersTable,
  sessionsTable,
} from "@workspace/db";

const TEST_DATES = {
  full: "2030-06-15",
  available: "2030-06-16",
  blocked: "2030-06-17",
  blockedMove: "2030-06-18",
  concurrent: "2030-06-19",
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
  method: "GET" | "POST" | "PATCH" | "DELETE",
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

async function requestBlockedDate(
  targetProviderId: number,
  dateStr: string,
): Promise<{ response: Response; json: any }> {
  const response = await fetch(
    `${baseUrl}/api/providers/my/approved/${targetProviderId}/blocked-dates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dateStr, reason: "اختبار" }),
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
    clientPhone: "0500000001",
    serviceDeliveryMethod: "delivery_installation",
    notes: "تفاصيل خدمة اختبارية",
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
      .delete(serviceBlockedDatesTable)
      .where(inArray(serviceBlockedDatesTable.providerId, testProviderIds));
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
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await pool.end();
});

describe("service appointment capacity and isolation", () => {
  it("adds a payment atomically without replacing booking or custody details", async () => {
    const created = await requestAppointment(providerId, "POST", "", appointmentBody(TEST_DATES.available, {
      amount: "500.50", deposit: "100.10", paymentMethod: "cash", cashDeposited: false,
    }));
    assert.equal(created.response.status, 201);
    const body = { amount: "50.25", expectedDeposit: "100.10", expectedPaymentMethod: "cash", expectedCashDeposited: false };
    const path = `/${created.json.id}/payments`;
    const results = await Promise.all([
      requestAppointment(providerId, "POST", path, body),
      requestAppointment(providerId, "POST", path, body),
    ]);
    assert.deepEqual(results.map(r => r.response.status).sort(), [200, 409]);
    const updated = results.find(r => r.response.ok)!.json;
    assert.equal(Number(updated.deposit), 150.35);
    assert.equal(updated.dateStr, created.json.dateStr);
    assert.equal(updated.paymentMethod, "cash");
    assert.equal(updated.cashDeposited, false);
    assert.equal(updated.notes, created.json.notes);
    const overpaid = await requestAppointment(providerId, "POST", path, { ...body, expectedDeposit: "150.35", amount: "400" });
    assert.equal(overpaid.response.status, 422);
    const changedMethod = await requestAppointment(providerId, "POST", path, { ...body, expectedDeposit: "150.35", expectedPaymentMethod: "transfer" });
    assert.equal(changedMethod.response.status, 409);
    for (const amount of ["0", "-1", "NaN", "1.001"]) {
      const invalid = await requestAppointment(providerId, "POST", path, { ...body, expectedDeposit: "150.35", amount });
      assert.equal(invalid.response.status, 422);
    }
    const otherProvider = await createProvider();
    assert.equal((await requestAppointment(otherProvider, "POST", path, body)).response.status, 404);
    const completed = await requestAppointment(providerId, "POST", path, { ...body, expectedDeposit: "150.35", amount: "350.15" });
    assert.equal(completed.response.status, 200);
    assert.equal(Number(completed.json.deposit), 500.50);
    assert.equal((await requestAppointment(providerId, "POST", path, { ...body, expectedDeposit: "500.50", amount: "0.01" })).response.status, 422);
    await requestAppointment(providerId, "PATCH", `/${created.json.id}`, { status: "cancelled" });
    assert.equal((await requestAppointment(providerId, "POST", path, { ...body, expectedDeposit: "500.50" })).response.status, 409);
  });

  it("reschedules the same booking while preserving its product details and financial values", async () => {
    const notes = "كيك رقم ٠١\nالملاحظات: بدون مكسرات، وكتابة مبروك";
    const created = await requestAppointment(providerId, "POST", "", appointmentBody(TEST_DATES.available, {
      startTime: "09:30", notes, amount: "480", deposit: "120", duration: "2",
    }));
    assert.equal(created.response.status, 201);
    assert.equal(created.json.startTime, "09:30");
    const id = created.json.id;
    const movedTime = await requestAppointment(providerId, "PATCH", `/${id}`, {
      startTime: "13:45", editReason: "طلب العميل تعديل وقت الموعد",
    });
    assert.equal(movedTime.response.status, 200);
    assert.equal(movedTime.json.id, id);
    assert.equal(movedTime.json.dateStr, TEST_DATES.available);
    assert.equal(movedTime.json.startTime, "13:45");
    assert.equal(movedTime.json.previousStartTime, "09:30");
    assert.equal(movedTime.json.notes, notes);
    assert.equal(movedTime.json.amount, "480.00");
    assert.equal(movedTime.json.deposit, "120.00");
    assert.equal(movedTime.json.duration, "2");
    assert.equal(movedTime.json.cancelledAt, null);

    for (const startTime of ["25:00", "12:60", "9:30", "invalid"]) {
      assert.equal((await requestAppointment(providerId, "PATCH", `/${id}`, { startTime })).response.status, 422);
    }
    const movedDay = await requestAppointment(providerId, "PATCH", `/${id}`, {
      dateStr: TEST_DATES.full, editReason: "تغيير تاريخ الموعد",
    });
    assert.equal(movedDay.response.status, 200);
    assert.equal(movedDay.json.startTime, "13:45");
    assert.equal(movedDay.json.notes, notes);
    assert.equal(movedDay.json.previousDateStr, TEST_DATES.available);
    const listed = await requestAppointment(providerId, "GET");
    assert.equal(listed.json.length, 1);
    assert.equal(listed.json[0].id, id);
    assert.equal(listed.json[0].dateStr, TEST_DATES.full);
    assert.equal(listed.json[0].startTime, "13:45");
    assert.equal(listed.json[0].notes, notes);
    assert.equal((await requestAppointment(providerId, "PATCH", `/${id}`, { startTime: null })).json.startTime, null);
  });

  it("persists receipt client details and clears identity when insurance is disabled", async () => {
    await db
      .update(serviceProvidersTable)
      .set({ requiresInsurance: true, insuranceAmount: "500" })
      .where(eq(serviceProvidersTable.id, providerId));

    const missingPhone = await requestAppointment(
      providerId,
      "POST",
      "",
      appointmentBody(TEST_DATES.available, { clientPhone: " " }),
    );
    assert.equal(missingPhone.response.status, 422);
    assert.equal(missingPhone.json.fieldErrors?.clientPhone?.[0], "رقم الجوال مطلوب");

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

    for (const invalidPhone of [" ", null]) {
      const rejectedUpdate = await requestAppointment(
        providerId,
        "PATCH",
        `/${created.json.id}`,
        { clientPhone: invalidPhone },
      );
      assert.equal(rejectedUpdate.response.status, 422);
    }

    const unrelatedUpdate = await requestAppointment(
      providerId,
      "PATCH",
      `/${created.json.id}`,
      { notes: "ملاحظة لا تغيّر بيانات الإيصال" },
    );
    assert.equal(unrelatedUpdate.response.status, 200);
    assert.equal(unrelatedUpdate.json.clientPhone, "0501234567");
    assert.equal(unrelatedUpdate.json.serviceAddress, "قاعة النخيل - حي الريان");
    assert.equal(unrelatedUpdate.json.clientIdNumber, "1098765432");

    const listed = await requestAppointment(providerId, "GET");
    assert.equal(listed.response.status, 200);
    const listedAppointment = listed.json.find(
      (appointment: { id: number }) => appointment.id === created.json.id,
    );
    assert.equal(listedAppointment.clientPhone, "0501234567");
    assert.equal(listedAppointment.serviceAddress, "قاعة النخيل - حي الريان");
    assert.equal(listedAppointment.clientIdNumber, "1098765432");
    assert.equal(listedAppointment.notes, "ملاحظة لا تغيّر بيانات الإيصال");

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

  it("persists and updates contract and cash-deposit statuses", async () => {
    const created = await requestAppointment(
      providerId,
      "POST",
      "",
      appointmentBody(TEST_DATES.available, {
        paymentMethod: "cash",
        deposit: "250",
        cashDeposited: true,
        contractSigned: true,
      }),
    );

    assert.equal(created.response.status, 201);
    assert.equal(created.json.cashDeposited, true);
    assert.equal(created.json.contractSigned, true);

    const updated = await requestAppointment(
      providerId,
      "PATCH",
      `/${created.json.id}`,
      { cashDeposited: false, contractSigned: false },
    );

    assert.equal(updated.response.status, 200);
    assert.equal(updated.json.cashDeposited, false);
    assert.equal(updated.json.contractSigned, false);
  });

  it("persists the real previous and new values when an appointment is rescheduled", async () => {
    const created = await requestAppointment(
      providerId,
      "POST",
      "",
      appointmentBody(TEST_DATES.available, {
        amount: "800",
        duration: "4",
        durationUnit: "hours",
      }),
    );
    assert.equal(created.response.status, 201);

    const rescheduled = await requestAppointment(
      providerId,
      "PATCH",
      `/${created.json.id}`,
      {
        dateStr: TEST_DATES.full,
        amount: "950",
        duration: "6",
        durationUnit: "hours",
        editReason: "طلب العميل",
      },
    );

    assert.equal(rescheduled.response.status, 200);
    assert.equal(rescheduled.json.previousDateStr, TEST_DATES.available);
    assert.equal(rescheduled.json.editedDateStr, TEST_DATES.full);
    assert.equal(rescheduled.json.dateStr, TEST_DATES.full);
    assert.equal(rescheduled.json.previousAmount, "800.00");
    assert.equal(rescheduled.json.amount, "950.00");
    assert.equal(rescheduled.json.previousDuration, "4");
    assert.equal(rescheduled.json.duration, "6");
    assert.equal(rescheduled.json.editReason, "طلب العميل");
    assert.ok(rescheduled.json.lastEditedAt);

    const listed = await requestAppointment(providerId, "GET");
    assert.equal(listed.response.status, 200);
    const persisted = listed.json.find(
      (appointment: { id: number }) => appointment.id === created.json.id,
    );
    assert.equal(persisted.previousDateStr, TEST_DATES.available);
    assert.equal(persisted.editedDateStr, TEST_DATES.full);
    assert.equal(persisted.dateStr, TEST_DATES.full);
    assert.equal(persisted.editReason, "طلب العميل");
  });

  it("rejects blocking a day with active appointments", async () => {
    const created = await requestAppointment(
      providerId,
      "POST",
      "",
      appointmentBody(TEST_DATES.available),
    );
    assert.equal(created.response.status, 201);

    const response = await fetch(
      `${baseUrl}/api/providers/my/approved/${providerId}/blocked-dates`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dateStr: TEST_DATES.available }),
      },
    );
    const json = await response.json() as { code?: string };

    assert.equal(response.status, 409);
    assert.equal(json.code, "ACTIVE_APPOINTMENTS_ON_DATE");
  });

  it("rejects creating, moving, and reactivating appointments on a blocked day", async () => {
    const blocked = await requestBlockedDate(providerId, TEST_DATES.blocked);
    assert.equal(blocked.response.status, 201);

    const createOnBlocked = await requestAppointment(
      providerId,
      "POST",
      "",
      appointmentBody(TEST_DATES.blocked),
    );
    assert.equal(createOnBlocked.response.status, 409);
    assert.equal(createOnBlocked.json.code, "SERVICE_DATE_BLOCKED");

    const movable = await requestAppointment(
      providerId,
      "POST",
      "",
      appointmentBody(TEST_DATES.available),
    );
    assert.equal(movable.response.status, 201);

    const blockedMove = await requestBlockedDate(providerId, TEST_DATES.blockedMove);
    assert.equal(blockedMove.response.status, 201);

    const moveToBlocked = await requestAppointment(
      providerId,
      "PATCH",
      `/${movable.json.id}`,
      { dateStr: TEST_DATES.blockedMove },
    );
    assert.equal(moveToBlocked.response.status, 409);
    assert.equal(moveToBlocked.json.code, "SERVICE_DATE_BLOCKED");

    const cancelled = await requestAppointment(
      providerId,
      "POST",
      "",
      appointmentBody(TEST_DATES.blocked, { status: "cancelled" }),
    );
    assert.equal(cancelled.response.status, 201);

    const reactivateOnBlocked = await requestAppointment(
      providerId,
      "PATCH",
      `/${cancelled.json.id}`,
      { status: "confirmed" },
    );
    assert.equal(reactivateOnBlocked.response.status, 409);
    assert.equal(reactivateOnBlocked.json.code, "SERVICE_DATE_BLOCKED");
  });

  it("never leaves an active appointment on a concurrently blocked day", async () => {
    const [booking, blocking] = await Promise.all([
      requestAppointment(
        providerId,
        "POST",
        "",
        appointmentBody(TEST_DATES.concurrent, { clientName: "طلب متزامن" }),
      ),
      requestBlockedDate(providerId, TEST_DATES.concurrent),
    ]);

    assert.deepEqual(
      [booking.response.status, blocking.response.status].sort((a, b) => a - b),
      [201, 409],
    );

    const [activeAppointments, blockedDates] = await Promise.all([
      db.select({ id: serviceAppointmentsTable.id })
        .from(serviceAppointmentsTable)
        .where(and(
          eq(serviceAppointmentsTable.providerId, providerId),
          eq(serviceAppointmentsTable.dateStr, TEST_DATES.concurrent),
          eq(serviceAppointmentsTable.status, "confirmed"),
        )),
      db.select({ id: serviceBlockedDatesTable.id })
        .from(serviceBlockedDatesTable)
        .where(and(
          eq(serviceBlockedDatesTable.providerId, providerId),
          eq(serviceBlockedDatesTable.dateStr, TEST_DATES.concurrent),
        )),
    ]);

    assert.equal(activeAppointments.length + blockedDates.length, 1);
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