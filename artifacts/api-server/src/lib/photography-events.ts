import type { Response } from "express";

const subscribers = new Map<number, Set<Response>>();
export function subscribePhotographyBookings(photographerId: number, response: Response) {
  let responses = subscribers.get(photographerId);
  if (!responses) subscribers.set(photographerId, responses = new Set());
  responses.add(response);
  return () => {
    responses.delete(response);
    if (!responses.size) subscribers.delete(photographerId);
  };
}
/** Called after payment confirmation commits; persisted notices remain authoritative. */
export function publishPhotographyBooking(photographerId: number, bookingId: number) {
  for (const response of subscribers.get(photographerId) ?? []) {
    if (response.destroyed || response.writableEnded) continue;
    try { response.write(`event: booking-confirmed\ndata: ${JSON.stringify({ bookingId })}\n\n`); }
    catch { /* A disconnected browser must not fail a paid booking. */ }
  }
}
