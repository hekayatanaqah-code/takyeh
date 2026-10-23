import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterOwnerNotifications as filter, notificationTimeBounds, type NotificationFilters } from "./ownerNotificationFilters";

const now = new Date("2026-10-23T12:00:00Z");
const base: NotificationFilters = { search: "", read: "all", time: "all" };
const notifications = [
  { id: 1, type: "new_booking", message: "حجز جديد في الياسمين — أَحمد", bookingId: 123, clientName: "أحمد", propertyName: "الياسمين", isRead: false, createdAt: "2026-10-23T01:00:00Z" },
  { id: 2, type: "booking_reminder", message: "⏰ تذكير بحجز [booking:456]", clientName: "سارة", propertyName: "النخيل", isRead: true, createdAt: "2026-10-18T01:00:00Z" },
  { id: 3, type: "new_booking", message: "حجز سابق", bookingId: 789, clientName: "عمر", propertyName: "الياسمين", isRead: false, createdAt: "2026-09-30T12:00:00Z" },
  { id: 4, type: "subscription_expiry_reminder", message: "تذكير بالاشتراك\u2063subscription-expiry:1799999999999:3\u2063", isRead: false, createdAt: "2026-10-01T12:00:00Z" },
];
const ids = (filters: Partial<NotificationFilters>) => filter(notifications, { ...base, ...filters }, now).map(n => n.id);

describe("notification search and combined filters", () => {
  it("searches customer and property names with Arabic normalization", () => {
    assert.deepEqual(ids({ search: "احمد" }), [1]);
    assert.deepEqual(ids({ search: "الْيَاسَمِين" }), [1, 3]);
    assert.deepEqual(ids({ search: "سارة النخيل" }), [2]);
  });
  it("matches booking numbers in Western, Eastern and Persian digits, including legacy tags", () => {
    for (const search of ["123", "١٢٣", "۱۲۳", "#١٢٣"]) assert.deepEqual(ids({ search }), [1]);
    assert.deepEqual(ids({ search: "٤٥٦" }), [2]);
    assert.deepEqual(ids({ search: "1799999999999" }), []);
  });
  it("combines search, unread and calendar filters without mutating notifications", () => {
    assert.deepEqual(ids({ search: "الياسمين", read: "unread", time: "month" }), [1]);
    assert.deepEqual(ids({ read: "unread" }), [1, 3, 4]);
    assert.deepEqual(ids({ time: "today" }), [1]);
    assert.deepEqual(ids({ time: "week" }), [1, 2]);
    assert.deepEqual(ids({ time: "month" }), [1, 2, 4]);
    assert.equal(notifications[0].isRead, false);
    assert.deepEqual(ids(base), [1, 2, 3, 4]);
  });
  it("uses Riyadh midnight with an exclusive upper boundary", () => {
    const bounds = notificationTimeBounds("today", new Date("2026-10-22T22:00:00Z"))!;
    assert.equal(new Date(bounds.start).toISOString(), "2026-10-22T21:00:00.000Z");
    assert.equal(new Date(bounds.end).toISOString(), "2026-10-23T21:00:00.000Z");
    const rows = [bounds.start - 1, bounds.start, bounds.end - 1, bounds.end].map((t, id) => ({ ...notifications[0], id, createdAt: new Date(t).toISOString() }));
    assert.deepEqual(filter(rows, { ...base, time: "today" }, now).map(n => n.id), [1, 2]);
  });
  it("handles week/month year boundaries and invalid timestamps", () => {
    const nextYear = new Date("2027-01-01T00:00:00Z");
    const month = notificationTimeBounds("month", nextYear)!;
    assert.equal(new Date(month.start).toISOString(), "2026-12-31T21:00:00.000Z");
    assert.equal(new Date(month.end).toISOString(), "2027-01-31T21:00:00.000Z");
    const week = notificationTimeBounds("week", nextYear)!;
    assert.equal(new Date(week.start).toISOString(), "2026-12-26T21:00:00.000Z");
    assert.deepEqual(filter([{ ...notifications[0], createdAt: "invalid" }], { ...base, time: "today" }, now), []);
  });
});
