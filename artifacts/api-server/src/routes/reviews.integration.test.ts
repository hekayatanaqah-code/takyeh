import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import {
  after,
  afterEach,
  before,
  describe,
  it,
} from "node:test";
import { eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import { createSession } from "../lib/auth";
import {
  chaletSubmissionsTable,
  chaletsTable,
  db,
  ownerBookingsTable,
  ownerNotificationsTable,
  pool,
  reviewInvitationsTable,
  reviewsTable,
  serviceAppointmentsTable,
  serviceProvidersTable,
  serviceReviewInvitationsTable,
  serviceReviewsTable,
  sessionsTable,
} from "@workspace/db";

type Json = Record<string, unknown> | unknown[];
type RequestResult = { response: Response; json: any };

let server: Server;
let baseUrl: string;
let sessionIds: string[] = [];
let ownerIds: string[] = [];
let providerIds: number[] = [];
let submissionIds: number[] = [];
let chaletIds: number[] = [];
let serviceInvitationIds: number[] = [];
let reviewInvitationIds: number[] = [];
let serviceReviewIds: number[] = [];
let reviewIds: number[] = [];
let appointmentIds: number[] = [];
let bookingIds: number[] = [];

async function listen(serverToStart: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    serverToStart.once("error", reject);
    serverToStart.listen(0, "127.0.0.1", () => resolve());
  });
  const address = serverToStart.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function createOwner(): Promise<{ ownerId: string; sessionId: string }> {
  const ownerId = `reviews-route-test-${randomUUID()}`;
  const sessionId = await createSession({
    user: {
      id: ownerId,
      email: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
    },
    access_token: "integration-test",
  });
  ownerIds.push(ownerId);
  sessionIds.push(sessionId);
  return { ownerId, sessionId };
}

async function createProvider(ownerId: string, label: string): Promise<number> {
  const [provider] = await db
    .insert(serviceProvidersTable)
    .values({
      ownerId,
      businessName: `${label} ${randomUUID()}`,
      category: "test",
      city: "القصيم",
      whatsappNumber: "0500000000",
      galleryPhotos: [],
      coverageTags: [],
      customFeatureTags: [],
      photoCaptions: [],
      dailyCapacity: 5,
      isActive: true,
    })
    .returning({ id: serviceProvidersTable.id });
  assert(provider);
  providerIds.push(provider.id);
  return provider.id;
}

async function createChalet(ownerId: string): Promise<number> {
  const nameAr = `اختبار عقار ${randomUUID()}`;
  const [submission] = await db
    .insert(chaletSubmissionsTable)
    .values({
      ownerId,
      nameAr,
      whatsappNumber: "0500000000",
      location: "القصيم",
      descriptionAr: "وصف اختبار",
      pricePerNight: "100",
      photos: [],
      amenities: [],
      status: "approved",
    })
    .returning({ id: chaletSubmissionsTable.id });
  assert(submission);
  submissionIds.push(submission.id);

  const inserted = await db.execute<{ id: number }>(sql`
    INSERT INTO chalets (
      submission_id,
      name_ar,
      description_ar,
      location,
      price_per_night,
      whatsapp_number,
      is_active
    )
    VALUES (
      ${submission.id},
      ${nameAr},
      ${"وصف اختبار"},
      ${"القصيم"},
      ${"100"},
      ${"0500000000"},
      ${true}
    )
    RETURNING id
  `);
  const chalet = inserted.rows[0];
  assert(chalet);
  chaletIds.push(chalet.id);
  return chalet.id;
}

async function createServiceAppointment(
  ownerId: string,
  providerId: number,
  clientName: string,
  clientPhone: string,
): Promise<void> {
  const [appointment] = await db
    .insert(serviceAppointmentsTable)
    .values({
      ownerId,
      providerId,
      clientName,
      clientPhone,
      dateStr: "2030-06-15",
      amount: "250",
      status: "confirmed",
    })
    .returning({ id: serviceAppointmentsTable.id });
  assert(appointment);
  appointmentIds.push(appointment.id);
}

async function createChaletBooking(
  ownerId: string,
  submissionId: number,
  clientName: string,
  clientPhone: string,
): Promise<void> {
  const [booking] = await db
    .insert(ownerBookingsTable)
    .values({
      ownerId,
      submissionId,
      clientName,
      clientPhone,
      bookingDate: "2030-06-15",
      totalPrice: "500",
    })
    .returning({ id: ownerBookingsTable.id });
  assert(booking);
  bookingIds.push(booking.id);
}

async function request(
  path: string,
  sessionId: string,
  init: RequestInit = {},
): Promise<RequestResult> {
  const response = await fetch(`${baseUrl}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${sessionId}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let json: Json | null = null;
  if (text) {
    try {
      json = JSON.parse(text) as Json;
    } catch {
      json = { raw: text };
    }
  }
  return { response, json };
}

async function createServiceReviewInvitation(
  providerId: number,
  sessionId: string,
): Promise<string> {
  const result = await request(
    `/providers/my/approved/${providerId}/review-invite`,
    sessionId,
    { method: "POST" },
  );
  assert.equal(result.response.status, 201);
  assert.equal(typeof result.json.token, "string");
  const [invitation] = await db
    .select({ id: serviceReviewInvitationsTable.id })
    .from(serviceReviewInvitationsTable)
    .where(eq(serviceReviewInvitationsTable.token, result.json.token))
    .limit(1);
  assert(invitation);
  serviceInvitationIds.push(invitation.id);
  return result.json.token as string;
}

async function insertChaletReview(chaletId: number, comment: string): Promise<void> {
  const [review] = await db
    .insert(reviewsTable)
    .values({
      chaletId,
      rating: 5,
      comment,
      photoUrls: [],
      isVerified: true,
      isHidden: false,
    })
    .returning({ id: reviewsTable.id });
  assert(review);
  reviewIds.push(review.id);
}

before(async () => {
  server = createServer(app);
  baseUrl = await listen(server);
});

afterEach(async () => {
  if (reviewIds.length > 0) {
    await db.delete(reviewsTable).where(inArray(reviewsTable.id, reviewIds));
  }
  if (reviewInvitationIds.length > 0) {
    await db.delete(reviewInvitationsTable).where(inArray(reviewInvitationsTable.id, reviewInvitationIds));
  }
  if (serviceReviewIds.length > 0) {
    await db.delete(serviceReviewsTable).where(inArray(serviceReviewsTable.id, serviceReviewIds));
  }
  if (serviceInvitationIds.length > 0) {
    await db.delete(serviceReviewInvitationsTable).where(inArray(serviceReviewInvitationsTable.id, serviceInvitationIds));
  }
  if (appointmentIds.length > 0) {
    await db.delete(serviceAppointmentsTable).where(inArray(serviceAppointmentsTable.id, appointmentIds));
  }
  if (bookingIds.length > 0) {
    await db.delete(ownerBookingsTable).where(inArray(ownerBookingsTable.id, bookingIds));
  }
  if (chaletIds.length > 0) {
    await db.delete(chaletsTable).where(inArray(chaletsTable.id, chaletIds));
  }
  if (submissionIds.length > 0) {
    await db.delete(chaletSubmissionsTable).where(inArray(chaletSubmissionsTable.id, submissionIds));
  }
  if (providerIds.length > 0) {
    await db.delete(serviceProvidersTable).where(inArray(serviceProvidersTable.id, providerIds));
  }
  if (ownerIds.length > 0) {
    await db.delete(ownerNotificationsTable).where(inArray(ownerNotificationsTable.ownerId, ownerIds));
  }
  if (sessionIds.length > 0) {
    await db.delete(sessionsTable).where(inArray(sessionsTable.sid, sessionIds));
  }

  reviewIds = [];
  reviewInvitationIds = [];
  serviceReviewIds = [];
  serviceInvitationIds = [];
  appointmentIds = [];
  bookingIds = [];
  chaletIds = [];
  submissionIds = [];
  providerIds = [];
  ownerIds = [];
  sessionIds = [];
});

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await pool.end();
});

describe("owner product isolation for service-only and mixed accounts", () => {
  it("keeps a services-only account out of chalet reviews and exposes its service clients", async () => {
    const { ownerId, sessionId } = await createOwner();
    const providerId = await createProvider(ownerId, "خدمة منفردة");
    await createServiceAppointment(ownerId, providerId, "عميل الخدمة", "0501111111");

    const serviceReviews = await request(
      `/providers/my/approved/${providerId}/reviews`,
      sessionId,
    );
    assert.equal(serviceReviews.response.status, 200);
    assert.deepEqual(serviceReviews.json, []);

    const chaletReviews = await request("/owner/reviews", sessionId);
    assert.equal(chaletReviews.response.status, 200);
    assert.deepEqual(chaletReviews.json, []);

    const chaletCustomers = await request("/owner/customers", sessionId);
    assert.equal(chaletCustomers.response.status, 200);
    assert.deepEqual(chaletCustomers.json, []);

    const serviceCustomers = await request(
      `/owner/service-clients?providerId=${providerId}`,
      sessionId,
    );
    assert.equal(serviceCustomers.response.status, 200);
    assert.equal(serviceCustomers.json.length, 1);
    assert.equal(serviceCustomers.json[0].client_phone, "0501111111");
    assert.equal(serviceCustomers.json[0].client_name, "عميل الخدمة");
  });

  it("separates chalet and service reviews and scopes service clients to the selected provider", async () => {
    const { ownerId, sessionId } = await createOwner();
    const providerOneId = await createProvider(ownerId, "المزود الأول");
    const providerTwoId = await createProvider(ownerId, "المزود الثاني");
    const chaletId = await createChalet(ownerId);
    const chaletSubmissionId = submissionIds[0];
    assert(chaletSubmissionId);

    await insertChaletReview(chaletId, "مراجعة العقار فقط");
    await createChaletBooking(ownerId, chaletSubmissionId, "عميل العقار", "0502222222");
    await createServiceAppointment(ownerId, providerOneId, "عميل المزود الأول", "0503333333");
    await createServiceAppointment(ownerId, providerTwoId, "عميل المزود الثاني", "0504444444");

    const serviceToken = await createServiceReviewInvitation(providerOneId, sessionId);
    const submitted = await request(`/reviews/${serviceToken}`, sessionId, {
      method: "POST",
      body: JSON.stringify({
        rating: 4,
        comment: "مراجعة الخدمة فقط",
      }),
    });
    assert.equal(submitted.response.status, 200);

    const chaletReviews = await request("/owner/reviews", sessionId);
    assert.equal(chaletReviews.response.status, 200);
    assert.equal(chaletReviews.json.length, 1);
    assert.equal(chaletReviews.json[0].comment, "مراجعة العقار فقط");
    assert.equal(
      chaletReviews.json.some((review: any) => review.comment === "مراجعة الخدمة فقط"),
      false,
    );

    const providerReviews = await request(
      `/providers/my/approved/${providerOneId}/reviews`,
      sessionId,
    );
    assert.equal(providerReviews.response.status, 200);
    assert.equal(providerReviews.json.length, 1);
    assert.equal(providerReviews.json[0].providerId, providerOneId);
    assert.equal(providerReviews.json[0].comment, "مراجعة الخدمة فقط");
    assert.equal(
      providerReviews.json.some((review: any) => review.comment === "مراجعة العقار فقط"),
      false,
    );

    const providerOneCustomers = await request(
      `/owner/service-clients?providerId=${providerOneId}`,
      sessionId,
    );
    assert.equal(providerOneCustomers.response.status, 200);
    assert.deepEqual(
      providerOneCustomers.json.map((customer: any) => customer.client_phone),
      ["0503333333"],
    );

    const providerTwoCustomers = await request(
      `/owner/service-clients?providerId=${providerTwoId}`,
      sessionId,
    );
    assert.equal(providerTwoCustomers.response.status, 200);
    assert.deepEqual(
      providerTwoCustomers.json.map((customer: any) => customer.client_phone),
      ["0504444444"],
    );

    const allServiceCustomers = await request("/owner/service-clients", sessionId);
    assert.equal(allServiceCustomers.response.status, 200);
    assert.deepEqual(
      allServiceCustomers.json.map((customer: any) => customer.client_phone).sort(),
      ["0503333333", "0504444444"],
    );
  });
});

describe("service review invitation single-use behavior", () => {
  it("accepts exactly one of two concurrent submissions for the same token", async () => {
    const { ownerId, sessionId } = await createOwner();
    const providerId = await createProvider(ownerId, "خدمة التزامن");
    const token = await createServiceReviewInvitation(providerId, sessionId);

    const results = await Promise.all([
      request(`/reviews/${token}`, sessionId, {
        method: "POST",
        body: JSON.stringify({ rating: 5, comment: "الطلب الأول" }),
      }),
      request(`/reviews/${token}`, sessionId, {
        method: "POST",
        body: JSON.stringify({ rating: 3, comment: "الطلب الثاني" }),
      }),
    ]);

    assert.deepEqual(
      results.map(({ response }) => response.status).sort((a, b) => a - b),
      [200, 410],
    );

    const [invitation] = await db
      .select()
      .from(serviceReviewInvitationsTable)
      .where(eq(serviceReviewInvitationsTable.token, token))
      .limit(1);
    assert.equal(invitation?.used, true);

    const savedReviews = await db
      .select()
      .from(serviceReviewsTable)
      .where(eq(serviceReviewsTable.providerId, providerId));
    serviceReviewIds.push(...savedReviews.map((review) => review.id));
    assert.equal(savedReviews.length, 1);
    assert.ok(["الطلب الأول", "الطلب الثاني"].includes(savedReviews[0]?.comment ?? ""));
  });
});