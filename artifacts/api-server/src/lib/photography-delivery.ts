import { db, photographyDeliveriesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";

export function photographyReadiness() {
  return {
    payment: Boolean(process.env.MOYASAR_SECRET_KEY),
    whatsapp: Boolean(process.env.PHOTOGRAPHY_WHATSAPP_ACCESS_TOKEN
      && process.env.PHOTOGRAPHY_WHATSAPP_PHONE_ID
      && process.env.PHOTOGRAPHY_WHATSAPP_INVITE_TEMPLATE
      && process.env.PHOTOGRAPHY_WHATSAPP_BOOKING_TEMPLATE),
  };
}

/** Durable, deduplicated transactional messages. Never treat an unavailable channel as sent. */
export async function deliverPhotographyMessage(id: number) {
  if (!photographyReadiness().whatsapp) {
    await db.update(photographyDeliveriesTable).set({ status: "blocked", error: "whatsapp_not_configured" })
      .where(and(eq(photographyDeliveriesTable.id, id), eq(photographyDeliveriesTable.status, "pending")));
    return { status: "blocked", error: "whatsapp_not_configured" };
  }
  const [delivery] = await db.update(photographyDeliveriesTable).set({ status: "sending", error: null })
    .where(and(eq(photographyDeliveriesTable.id, id), eq(photographyDeliveriesTable.status, "pending"))).returning();
  if (!delivery) return { status: "already_processed" };
  try {
    const response = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(process.env.PHOTOGRAPHY_WHATSAPP_PHONE_ID!)}/messages`, {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.PHOTOGRAPHY_WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: delivery.recipient, type: "template",
        template: {
          name: delivery.kind === "invite" ? process.env.PHOTOGRAPHY_WHATSAPP_INVITE_TEMPLATE : process.env.PHOTOGRAPHY_WHATSAPP_BOOKING_TEMPLATE,
          language: { code: process.env.PHOTOGRAPHY_WHATSAPP_TEMPLATE_LANGUAGE || "ar" },
          components: [{ type: "body", parameters: delivery.parameters.map(text => ({ type: "text", text })) }],
        },
      }),
    });
    const body = await response.json() as { messages?: { id: string }[] };
    if (!response.ok || !body.messages?.[0]?.id) throw new Error("provider_rejected");
    // Provider acceptance is not a delivery receipt.
    await db.update(photographyDeliveriesTable).set({ status: "accepted", providerMessageId: body.messages[0].id })
      .where(eq(photographyDeliveriesTable.id, id));
    return { status: "accepted" };
  } catch {
    await db.update(photographyDeliveriesTable).set({ status: "failed", error: "whatsapp_send_failed" })
      .where(eq(photographyDeliveriesTable.id, id));
    logger.warn({ deliveryId: id }, "Photography WhatsApp delivery failed");
    return { status: "failed", error: "whatsapp_send_failed" };
  }
}
