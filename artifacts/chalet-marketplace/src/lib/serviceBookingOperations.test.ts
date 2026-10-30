import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { serviceBookingComplete, serviceBookingMatches, serviceCalendarBookings } from "./serviceBookingOperations";

const single = { id: 1, dateStr: "2026-10-31", duration: "5", durationUnit: "hours", status: "confirmed", amount: "330", deposit: "100" };
const midnight = Date.parse("2026-11-01T00:00:00+03:00");

it("moves a one-day request to completed exactly at Saudi midnight without modifying its record", () => {
  const booking = Object.freeze({ ...single });
  assert.equal(serviceBookingComplete(booking, midnight - 1), false);
  assert.equal(serviceBookingComplete(booking, midnight), true);
  assert.equal(serviceBookingMatches(booking, "active", "all", "all", midnight - 1), true);
  assert.equal(serviceBookingMatches(booking, "active", "all", "all", midnight), false);
  assert.equal(serviceBookingMatches(booking, "completed", "all", "all", midnight), true);
  assert.equal(booking.status, "confirmed");
});

it("retains multi-day requests through the whole last day across month and year boundaries", () => {
  const multi = { ...single, duration: "3", durationUnit: "days" };
  const end = Date.parse("2026-11-03T00:00:00+03:00");
  assert.equal(serviceBookingComplete(multi, end - 1), false);
  assert.equal(serviceBookingComplete(multi, end), true);
  const yearEnd = { ...multi, dateStr: "2026-12-31", duration: "2" };
  assert.equal(serviceBookingComplete(yearEnd, Date.parse("2027-01-01T23:59:59+03:00")), false);
  assert.equal(serviceBookingComplete(yearEnd, Date.parse("2027-01-02T00:00:00+03:00")), true);
});

it("maps every occupied day and preserves simultaneous identities, without inventing bookings", () => {
  const second = { ...single, id: 2, duration: "3", durationUnit: "days" };
  const original = [single, second];
  const before = JSON.stringify(original);
  const map = serviceCalendarBookings(original);
  assert.deepEqual(map.get("2026-10-31")?.map(b => b.id), [1, 2]);
  assert.deepEqual(map.get("2026-11-01")?.map(b => b.id), [2]);
  assert.deepEqual(map.get("2026-11-02")?.map(b => b.id), [2]);
  assert.equal(map.has("2026-11-03"), false);
  assert.equal(JSON.stringify(original), before);
  assert.equal(map.get("2026-11-01")?.[0], second);
});

it("keeps cancelled requests separate and combines payment filters with active/archive and status scopes", () => {
  const now = midnight - 1;
  assert.equal(serviceBookingMatches(single, "active", "confirmed", "unpaid", now), true);
  assert.equal(serviceBookingMatches(single, "active", "pending", "all", now), false);
  assert.equal(serviceBookingMatches(single, "active", "all", "paid", now), false);
  const paid = { ...single, deposit: "330", insuranceAmount: "500" };
  assert.equal(serviceBookingMatches(paid, "active", "all", "paid", now), true);
  const withInsurance = { ...single, insuranceAmount: "500" };
  assert.equal(serviceBookingMatches(withInsurance, "active", "all", "unpaid", now), true);
  assert.equal(serviceBookingMatches(withInsurance, "active", "all", "paid", now), false);
  const cancelled = { ...single, status: "cancelled" };
  assert.equal(serviceBookingMatches(cancelled, "active", "all", "all", now), false);
  assert.equal(serviceBookingMatches(cancelled, "completed", "all", "all", midnight), false);
  assert.equal(serviceBookingMatches(cancelled, "cancelled", "all", "all", now), true);
});

it("keeps malformed dates out of the grid without falsely archiving them or making unknown prices fully paid", () => {
  for (const dateStr of ["", "2026-02-30", "invalid"]) {
    const invalid = { ...single, dateStr };
    assert.equal(serviceBookingComplete(invalid, midnight), false);
    assert.equal(serviceCalendarBookings([invalid]).size, 0);
  }
  assert.equal(serviceBookingMatches({ ...single, amount: null }, "active", "all", "paid", midnight - 1), false);
});

it("the existing financial card keeps service settlement independent of refundable insurance", () => {
  const source = readFileSync(new URL("../components/owner/ServiceBookingCard.tsx", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("export type ServiceFinancialStrip"), source.indexOf("const STRIP_TONE"));
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const financialState = new Function("exports", "servicePaymentMethodLabel", `${js}; return exports.serviceFinancialState;`)({}, (method: string) => method);
  const withInsurance = financialState({ ...single, insuranceAmount: "1000", paymentMethod: "cash" });
  assert.equal(withInsurance.total, 330);
  assert.equal(withInsurance.paid, 100);
  assert.equal(withInsurance.remaining, 230);
  assert.equal(withInsurance.canCollect, true);
  assert.equal(financialState({ ...single, deposit: "330", insuranceAmount: "1000" }).remaining, 0);
  assert.ok(source.includes("منفصل عن المدفوع والمتبقي لأصل الخدمة"));
});

it("wires service-only scope, fixed service identity, grid navigation and live badges to the actual dashboard", () => {
  const source = readFileSync(new URL("../pages/Dashboard.tsx", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("function ServiceCalendarBookingsTab()"), source.indexOf("function ServiceSeasonsTab()"));
  assert.ok(code.includes('useState<ServiceBookingScope>("active")'));
  assert.ok(code.includes("serviceBookingMatches(a, serviceBookingScope, listFilter, servicePaymentFilter, serviceClock)"));
  assert.ok(code.includes("data-service-calendar-booking-id={appointment.id}"));
  assert.ok(code.includes("const cellAppointments = serviceCalendarMap.get(ds) ?? [];"));
  assert.ok(code.includes("sortServiceBookings(serviceCalendarMap.get(summaryDate) ?? [], todayStr)"));
  assert.ok(code.includes("setServiceCalendarFocusDate(appointment.dateStr)"));
  assert.ok(code.includes("serviceCalendarRootRef.current?.querySelector"), "jump must stay within this provider's calendar in the all-services view");
  assert.ok(code.includes("now={serviceClock}"));
  assert.ok(code.includes('value={provider?.businessName ?? ""} readOnly'));
  assert.ok(code.includes("const { providerId } = useServiceErp()"));
  assert.ok(code.includes("`/providers/my/approved/${providerId}/appointments`"));
});

it("refreshes open lists exactly at Saudi midnight and on tab focus, then cleans up timers/listeners", () => {
  const source = readFileSync(new URL("../hooks/useSaudiDayClock.ts", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("export function")).replace("export function", "function");
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let now = Date.parse("2026-10-31T23:59:59+03:00");
  const updates: number[] = [];
  const timers: Array<{ callback: () => void; delay: number }> = [];
  const listeners = new Map<string, () => void>();
  const removed: string[] = [];
  let cleanup: (() => void) | undefined;
  const makeHook = new Function("useEffect", "useState", "Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "window", "document",
    `${js}; return useSaudiDayClock;`);
  const target = {
    addEventListener: (event: string, callback: () => void) => listeners.set(event, callback),
    removeEventListener: (event: string) => { removed.push(event); },
  };
  const hook = makeHook(
    (effect: () => () => void) => { cleanup = effect(); },
    (initial: () => number) => [initial(), (value: number) => updates.push(value)],
    { now: () => now },
    (callback: () => void, delay: number) => { timers.push({ callback, delay }); return timers.length; },
    () => removed.push("timeout"),
    () => 1,
    () => removed.push("interval"),
    target, target,
  );
  hook();
  assert.equal(timers[0].delay, 1000);
  now += 1000;
  timers[0].callback();
  assert.equal(updates.at(-1), now);
  assert.equal(timers[1].delay, 86400000);
  now += 1000;
  listeners.get("focus")!();
  assert.equal(updates.at(-1), now);
  cleanup!();
  assert.deepEqual(removed.sort(), ["focus", "interval", "timeout", "visibilitychange"].sort());
});
