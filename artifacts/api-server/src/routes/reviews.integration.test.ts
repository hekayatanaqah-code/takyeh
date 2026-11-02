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
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import { INSURANCE_NOT_READY_MESSAGE, REVIEW_NOT_READY_MESSAGE } from "@workspace/booking-time";
import { bookingCheckoutAt, isStayComplete } from "@workspace/booking-time";
import { createSession } from "../lib/auth";
import {
  chaletSubmissionsTable,
  chaletsTable,
  db,
  ownerBookingsTable,
  ownerSubscriptionsTable,
  ownerCustomersTable,
  ownerRescheduleLogsTable,
  chaletAvailabilityTable,
  ownerNotificationsTable,
  pool,
  reviewInvitationsTable,
  reviewsTable,
  serviceAppointmentsTable,
  serviceProvidersTable,
  serviceReviewInvitationsTable,
  serviceReviewsTable,
  sessionsTable,
  adminAuditLogsTable,
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

  const [chalet] = await db
    .insert(chaletsTable)
    .values({
      submissionId: submission.id,
      ownerId,
      nameAr,
      descriptionAr: "وصف اختبار",
      location: "القصيم",
      pricePerNight: "100",
      whatsappNumber: "0500000000",
      isActive: true,
    })
    .returning({ id: chaletsTable.id });
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
  if (ownerIds.length > 0) {
    await db.delete(ownerRescheduleLogsTable).where(inArray(ownerRescheduleLogsTable.ownerId, ownerIds));
    await db.delete(ownerCustomersTable).where(inArray(ownerCustomersTable.ownerId, ownerIds));
    await db.delete(ownerSubscriptionsTable).where(inArray(ownerSubscriptionsTable.ownerId, ownerIds));
  }
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
    await db.delete(chaletAvailabilityTable).where(inArray(chaletAvailabilityTable.chaletId, chaletIds));
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

it("requires a reason, scopes objections to their owner, and lets administration keep or delete both kinds", async () => {
  const owner = await createOwner();
  const outsider = await createOwner();
  const admin = await createOwner();
  const providerId = await createProvider(owner.ownerId, "اعتراض");
  const otherProviderId = await createProvider(outsider.ownerId, "نشاط آخر");
  const [serviceReview] = await db.insert(serviceReviewsTable).values({ providerId, rating: 2, comment: "اختبار اعتراض" }).returning();
  serviceReviewIds.push(serviceReview.id);
  const path = `/providers/my/approved/${providerId}/reviews/${serviceReview.id}/report`;
  const post = (reason: string) => ({ method: "POST", body: JSON.stringify({ reason }) });
  assert.equal((await request(path, "invalid-session", post("سبب"))).response.status, 401);
  assert.equal((await request(path, outsider.sessionId, post("سبب"))).response.status, 404);
  assert.equal((await request(path, owner.sessionId, post("   "))).response.status, 422);
  assert.equal((await request(path, owner.sessionId, post("ا".repeat(501)))).response.status, 422);
  assert.equal((await request(`/providers/my/approved/${otherProviderId}/reviews/${serviceReview.id}/report`, outsider.sessionId, post("سبب"))).response.status, 409);
  assert.equal((await request(path, owner.sessionId, post("التقييم مخالف"))).response.status, 200);
  assert.equal((await request(path, owner.sessionId, post("استبدال السبب"))).response.status, 409);
  const [pending] = await db.select().from(serviceReviewsTable).where(eq(serviceReviewsTable.id, serviceReview.id));
  assert.equal(pending.reportReason, "التقييم مخالف");
  assert.equal(pending.isHidden, false);
  assert.equal((await request("/admin/service-reviews", owner.sessionId)).response.status, 401);
  const previousAdmin = process.env.ADMIN_USER_ID;
  process.env.ADMIN_USER_ID = admin.ownerId;
  try {
    const listed = await request("/admin/service-reviews", admin.sessionId);
    assert.equal(listed.response.status, 200);
    assert(listed.json.some((r: any) => r.id === serviceReview.id && r.reportReason === "التقييم مخالف"));
    const decisionPath = `/admin/service-reviews/${serviceReview.id}/decision`;
    const decide = (decision: string) => ({ method: "POST", body: JSON.stringify({ decision }) });
    assert.equal((await request(decisionPath, admin.sessionId, decide("keep"))).response.status, 200);
    const [kept] = await db.select().from(serviceReviewsTable).where(eq(serviceReviewsTable.id, serviceReview.id));
    assert.equal(kept.reportedAt, null);
    const serviceNotices = await db.select().from(ownerNotificationsTable).where(eq(ownerNotificationsTable.ownerId, owner.ownerId));
    assert.equal(serviceNotices.length, 1);
    assert(serviceNotices[0].message.includes("إبقاء التقييم"));
    assert.equal((await request(decisionPath, admin.sessionId, decide("delete"))).response.status, 409);
    assert.equal((await request(path, owner.sessionId, post("اعتراض جديد"))).response.status, 200);
    assert.equal((await request(decisionPath, admin.sessionId, decide("delete"))).response.status, 200);
    assert.equal((await db.select().from(serviceReviewsTable).where(eq(serviceReviewsTable.id, serviceReview.id))).length, 0);
    assert.equal((await db.select().from(ownerNotificationsTable).where(eq(ownerNotificationsTable.ownerId, owner.ownerId))).length, 1);
    const chaletId = await createChalet(owner.ownerId);
    const [propertyReview] = await db.insert(reviewsTable).values({ chaletId, rating: 1, comment: "تقييم عقار" }).returning();
    reviewIds.push(propertyReview.id);
    const propertyPath = `/owner/reviews/${propertyReview.id}/report`;
    assert.equal((await request(propertyPath, owner.sessionId, post(""))).response.status, 400);
    assert.equal((await request(propertyPath, owner.sessionId, post("تقييم غير منصف"))).response.status, 200);
    assert.equal((await request(`/admin/reviews/${propertyReview.id}/dismiss-report`, admin.sessionId, { method: "POST" })).response.status, 200);
    assert.equal((await db.select().from(ownerNotificationsTable).where(eq(ownerNotificationsTable.ownerId, owner.ownerId))).length, 2);
    assert.equal((await request(propertyPath, owner.sessionId, post("طلب مراجعة"))).response.status, 200);
    assert.equal((await request(`/admin/reviews/${propertyReview.id}`, admin.sessionId, { method: "DELETE" })).response.status, 200);
    const notices = await db.select().from(ownerNotificationsTable).where(eq(ownerNotificationsTable.ownerId, owner.ownerId));
    // The property's prior keep-notice is linked to the deleted review and
    // follows its existing cascade; deletion must not create a replacement.
    assert.equal(notices.length, 1);
    assert(notices.every(n => n.message.includes("إبقاء التقييم")));
    assert(!notices.some(n => n.message.includes("حذف التقييم")));
  } finally {
    if (previousAdmin === undefined) delete process.env.ADMIN_USER_ID;
    else process.env.ADMIN_USER_ID = previousAdmin;
    await db.delete(adminAuditLogsTable).where(eq(adminAuditLogsTable.actorId, admin.ownerId));
  }
});

describe("owner product isolation for service-only and mixed accounts", () => {
  it("pins creation, preserves pins across property edits and no-op saves, and deliberately repins rescheduling", async () => {
    const { ownerId, sessionId } = await createOwner();
    await db.insert(ownerSubscriptionsTable).values({
      ownerId, status: "active", expiresAt: new Date("2099-01-01"),
    });
    const chaletId = await createChalet(ownerId);
    const submissionId = submissionIds[0];
    const originalTimes = { morningCheckIn: "٦ ص", morningCheckOut: "٤ م" };
    const changedTimes = { morningCheckIn: "٦ ص", morningCheckOut: "٨ ص" };
    await db.update(chaletsTable).set(originalTimes).where(eq(chaletsTable.id, chaletId));
    const create = async (bookingDate: string) => {
      const result = await request("/owner/bookings", sessionId, {
        method: "POST",
        body: JSON.stringify({ submissionId, bookingDate, period: "morning", durationDays: 1,
          clientName: "ضيف الموعد المثبت", clientPhone: "0508888888", insuranceFee: 300,
          checkoutAt: "1900-01-01T00:00:00Z" }),
      });
      assert.equal(result.response.status, 201, JSON.stringify(result.json));
      bookingIds.push(result.json.id);
      return result.json;
    };
    const first = await create("2030-06-15");
    assert.equal(Date.parse(first.checkoutAt), bookingCheckoutAt({
      bookingDate: first.bookingDate, period: first.period, durationDays: first.durationDays,
    }, originalTimes));
    await db.update(chaletsTable).set(changedTimes).where(eq(chaletsTable.id, chaletId));
    await db.update(chaletSubmissionsTable).set(changedTimes).where(eq(chaletSubmissionsTable.id, submissionId));
    const listed = (await request("/owner/bookings", sessionId)).json.find((b: any) => b.id === first.id);
    assert.equal(listed.checkoutAt, first.checkoutAt);
    const boundary = Date.parse("2030-06-15T12:00:00+03:00");
    assert.equal(isStayComplete(listed, changedTimes, boundary), false);
    const insurance = await request("/owner/deposits", sessionId);
    assert.equal(insurance.response.status, 200);
    assert.equal(insurance.json.find((b: any) => b.id === first.id).checkoutAt, first.checkoutAt);
    const patch = (body: object) => request(`/owner/bookings/${first.id}`, sessionId, { method: "PATCH", body: JSON.stringify(body) });
    const noop = await patch({ bookingDate: first.bookingDate, durationDays: 1, period: "morning", notes: "ملاحظة" });
    assert.equal(noop.response.status, 200);
    assert.equal(noop.json.checkoutAt, first.checkoutAt);
    assert.equal((await patch({ insuranceRefunded: true })).response.status, 409);
    assert.equal((await request("/owner/review-invite", sessionId, {
      method: "POST", body: JSON.stringify({ chaletId, bookingId: first.id }),
    })).response.status, 409);
    const second = await create("2030-06-16");
    assert.equal(second.checkoutAt, new Date("2030-06-16T08:00:00+03:00").toISOString());
    const periodChange = await patch({ period: "evening" });
    assert.equal(periodChange.response.status, 200);
    assert.equal(periodChange.json.checkoutAt, new Date("2030-06-16T00:00:00+03:00").toISOString());
    const durationChange = await patch({ durationDays: 2 });
    assert.equal(durationChange.json.checkoutAt, new Date("2030-06-17T00:00:00+03:00").toISOString());
    const past = await patch({ bookingDate: "2020-06-15", durationDays: 1, period: "morning" });
    assert.equal(past.json.checkoutAt, new Date("2020-06-15T08:00:00+03:00").toISOString());
    const archivedBefore = await request("/owner/bookings/archive?tab=completed", sessionId);
    assert(archivedBefore.json.bookings.some((b: any) => b.id === first.id));
    // Opposite direction: even a future-looking live schedule cannot close a pinned past stay.
    await db.update(chaletsTable).set({ morningCheckOut: "١١ م" }).where(eq(chaletsTable.id, chaletId));
    const archivedAfter = await request("/owner/bookings/archive?tab=completed", sessionId);
    assert.deepEqual(archivedAfter.json.bookings, archivedBefore.json.bookings);
    await db.update(ownerBookingsTable).set({ cancelledAt: new Date() }).where(eq(ownerBookingsTable.id, first.id));
    const restored = await patch({ restore: true });
    assert.equal(restored.response.status, 200);
    assert.equal(restored.json.checkoutAt, past.json.checkoutAt);
    assert.equal((await patch({ insuranceRefunded: true })).response.status, 200);
    const invite = await request("/owner/review-invite", sessionId, {
      method: "POST", body: JSON.stringify({ chaletId, bookingId: first.id }),
    });
    assert.equal(invite.response.status, 200);
    const [invitation] = await db.select().from(reviewInvitationsTable)
      .where(eq(reviewInvitationsTable.token, invite.json.token));
    reviewInvitationIds.push(invitation.id);
    const future = await patch({ bookingDate: "2099-06-15" });
    assert.equal(future.response.status, 200);
    assert.equal((await request(`/reviews/${invite.json.token}`, "")).response.status, 409);
    assert.equal((await request(`/reviews/${invite.json.token}`, "", {
      method: "POST", body: JSON.stringify({ rating: 5 }),
    })).response.status, 409);
    assert.equal((await patch({ bookingDate: "2026-02-30" })).response.status, 400);
  });

  it("blocks early insurance settlement and review creation/open/submission while allowing receipt", async () => {
    const { ownerId, sessionId } = await createOwner();
    const chaletId = await createChalet(ownerId);
    await createChaletBooking(ownerId, submissionIds[0], "ضيف إقامة مستقبلية", "0509999999");
    const bookingId = bookingIds[0];
    await db.update(ownerBookingsTable).set({ bookingDate: "2099-06-15", insuranceFee: "300" })
      .where(eq(ownerBookingsTable.id, bookingId));
    const receipt = await request(`/owner/bookings/${bookingId}`, sessionId, {
      method: "PATCH", body: JSON.stringify({ insuranceReceived: true }),
    });
    assert.equal(receipt.response.status, 200);
    assert.equal(receipt.json.insuranceReceived, true);
    for (const patch of [{ insuranceRefunded: true }, { insuranceDeducted: 50, insuranceDeductReason: "تلفيات" }]) {
      const result = await request(`/owner/bookings/${bookingId}`, sessionId, {
        method: "PATCH", body: JSON.stringify(patch),
      });
      assert.equal(result.response.status, 409);
      assert.equal(result.json.error, INSURANCE_NOT_READY_MESSAGE);
    }
    const earlyInvite = await request("/owner/review-invite", sessionId, {
      method: "POST", body: JSON.stringify({ chaletId, bookingId }),
    });
    assert.equal(earlyInvite.response.status, 409);
    assert.equal(earlyInvite.json.error, REVIEW_NOT_READY_MESSAGE);
    // Historical links must be blocked too, on both read and write.
    const [invitation] = await db.insert(reviewInvitationsTable).values({
      token: randomUUID(), chaletId, bookingId,
    }).returning();
    reviewInvitationIds.push(invitation.id);
    for (const init of [{}, { method: "POST", body: JSON.stringify({ rating: 5 }) }]) {
      const result = await request(`/reviews/${invitation.token}`, "", init);
      assert.equal(result.response.status, 409);
      assert.equal(result.json.error, REVIEW_NOT_READY_MESSAGE);
    }
    const [unchanged] = await db.select().from(ownerBookingsTable).where(eq(ownerBookingsTable.id, bookingId));
    assert.equal(unchanged.insuranceRefunded, false);
    assert.equal(Number(unchanged.insuranceDeducted ?? 0), 0);
    const [unused] = await db.select().from(reviewInvitationsTable).where(eq(reviewInvitationsTable.id, invitation.id));
    assert.equal(unused.used, false);
  });

  it("allows completed-stay settlement and reviews, but rechecks a link after rescheduling", async () => {
    const { ownerId, sessionId } = await createOwner();
    const chaletId = await createChalet(ownerId);
    await createChaletBooking(ownerId, submissionIds[0], "ضيف إقامة مكتملة", "0508888888");
    const bookingId = bookingIds[0];
    await db.update(ownerBookingsTable).set({ bookingDate: "2020-06-15", insuranceFee: "300" })
      .where(eq(ownerBookingsTable.id, bookingId));
    const refund = await request(`/owner/bookings/${bookingId}`, sessionId, {
      method: "PATCH", body: JSON.stringify({ insuranceRefunded: true, insuranceDeducted: 0 }),
    });
    assert.equal(refund.response.status, 200);
    assert.equal(refund.json.insuranceRefunded, true);
    const invite = await request("/owner/review-invite", sessionId, {
      method: "POST", body: JSON.stringify({ chaletId, bookingId }),
    });
    assert.equal(invite.response.status, 200);
    const [invitation] = await db.select().from(reviewInvitationsTable)
      .where(eq(reviewInvitationsTable.token, invite.json.token));
    reviewInvitationIds.push(invitation.id);
    assert.equal((await request(`/reviews/${invite.json.token}`, "")).response.status, 200);
    await db.update(ownerBookingsTable).set({ bookingDate: "2099-06-15" }).where(eq(ownerBookingsTable.id, bookingId));
    assert.equal((await request(`/reviews/${invite.json.token}`, "")).response.status, 409);
    assert.equal((await request(`/reviews/${invite.json.token}`, "", {
      method: "POST", body: JSON.stringify({ rating: 5 }),
    })).response.status, 409);
    // Restore completion and verify that a real review can be submitted.
    await db.update(ownerBookingsTable).set({ bookingDate: "2020-06-15" }).where(eq(ownerBookingsTable.id, bookingId));
    const submitted = await request(`/reviews/${invite.json.token}`, "", {
      method: "POST", body: JSON.stringify({ rating: 5 }),
    });
    const created = await db.select().from(reviewsTable).where(eq(reviewsTable.invitationId, invitation.id));
    reviewIds.push(...created.map(row => row.id));
    assert.equal(submitted.response.status, 200);
    assert.equal(created.length, 1);
  });

  it("cannot attach an owner's review invitation to another property's booking", async () => {
    const { ownerId, sessionId } = await createOwner();
    const chaletId = await createChalet(ownerId);
    const otherChaletId = await createChalet(ownerId);
    await createChaletBooking(ownerId, submissionIds[0], "ضيف", "0507777777");
    await db.update(ownerBookingsTable).set({ bookingDate: "2020-06-15" }).where(eq(ownerBookingsTable.id, bookingIds[0]));
    const result = await request("/owner/review-invite", sessionId, {
      method: "POST", body: JSON.stringify({ chaletId: otherChaletId, bookingId: bookingIds[0] }),
    });
    assert.equal(result.response.status, 400);
    assert.notEqual(chaletId, otherChaletId);
  });

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