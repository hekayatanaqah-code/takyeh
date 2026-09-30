import { Router } from "express";
import nodemailer from "nodemailer";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { z } from "zod";
import { logger } from "../lib/logger";
import {
  defaultBroadcastPreferences,
  deduplicateRecipients,
  emailDeliveryBlockReason,
  idempotencyPayloadMatches,
  mergeBroadcastPreferences,
  normalizeE164Phone,
  recipientKeyForAlias,
  selectAudienceOwnerIds,
} from "../lib/broadcast-utils";

const router = Router();
const channels = ["inApp", "inbox", "email", "whatsapp"] as const;
const audienceSchema = z.enum(["all", "active", "providers"]);
const createSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
  audience: audienceSchema,
  channels: z.array(z.enum(channels)).min(1).max(4).refine(values => new Set(values).size === values.length, "Duplicate channels are not allowed"),
}).strict();

type Channel = typeof channels[number];
type Preferences = Record<Channel, boolean>;
type Recipient = {
  key: string;
  ownerId: string;
  appId: number | null;
  email: string | null;
  whatsappPhone: string | null;
  name: string | null;
  prefs: Preferences;
};
type OwnerRow = {
  app_id: number; email: string | null; full_name: string | null; user_id: string | null;
  wa_phone: string | null; wa_settings_enabled: boolean;
  whatsapp_news_subscribe: boolean | null; whatsapp_subscribed_at: Date | string | null;
};

function smtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

async function getRecipients(audience: z.infer<typeof audienceSchema>): Promise<Recipient[]> {
  const byCanonicalId = new Map<string, Recipient>();
  const ownerAliases = new Map<string, Recipient>();
  const appRecipient = (row: OwnerRow): Recipient => ({
    key: `app:${row.app_id}`,
    ownerId: row.user_id || `owner_${row.app_id}`,
    appId: Number(row.app_id),
    email: row.email,
    whatsappPhone: row.whatsapp_news_subscribe && row.whatsapp_subscribed_at && row.wa_settings_enabled
      ? normalizeE164Phone(row.wa_phone) : null,
    name: row.full_name,
    prefs: defaultBroadcastPreferences(),
  });

  let chaletOwnerIds: string[] = [];
  let providerOwnerIds: string[] = [];
  let activeSubscriberIds: string[] = [];
  if (audience === "all") {
    const [chaletResult, providerResult, activeResult] = await Promise.all([
      db.execute<{ owner_id: string }>(sql`
        SELECT DISTINCT owner_id FROM chalet_submissions
        WHERE status = 'approved' AND owner_id IS NOT NULL AND owner_id <> ''
          AND LEFT(owner_id, 6) <> '__demo'
      `),
      db.execute<{ owner_id: string }>(sql`
        SELECT DISTINCT owner_id FROM service_providers
        WHERE owner_id IS NOT NULL AND owner_id <> ''
      `),
      db.execute<{ owner_id: string }>(sql`
        SELECT DISTINCT owner_id FROM owner_subscriptions
        WHERE status = 'active' AND (expires_at IS NULL OR expires_at > now())
      `),
    ]);
    chaletOwnerIds = ((chaletResult as any).rows as Array<{ owner_id: string }>).map(row => row.owner_id);
    providerOwnerIds = ((providerResult as any).rows as Array<{ owner_id: string }>).map(row => row.owner_id);
    activeSubscriberIds = ((activeResult as any).rows as Array<{ owner_id: string }>).map(row => row.owner_id);
  } else if (audience === "active") {
    const activeResult = await db.execute<{ owner_id: string }>(sql`
      SELECT DISTINCT owner_id FROM owner_subscriptions
      WHERE status = 'active' AND (expires_at IS NULL OR expires_at > now())
    `);
    activeSubscriberIds = ((activeResult as any).rows as Array<{ owner_id: string }>).map(row => row.owner_id);
  } else {
    const providerResult = await db.execute<{ owner_id: string }>(sql`
      SELECT DISTINCT owner_id FROM service_providers
      WHERE is_active = true AND owner_id IS NOT NULL AND owner_id <> ''
    `);
    providerOwnerIds = ((providerResult as any).rows as Array<{ owner_id: string }>).map(row => row.owner_id);
  }

  const sourceOwnerIds = selectAudienceOwnerIds(audience, {
    chaletOwners: chaletOwnerIds,
    providers: providerOwnerIds,
    activeSubscribers: activeSubscriberIds,
  });
  if (!sourceOwnerIds.length) return [];

  for (let offset = 0; offset < sourceOwnerIds.length; offset += 500) {
    const chunk = sourceOwnerIds.slice(offset, offset + 500);
    const matches = sql.join(chunk.map(ownerId => sql`
      (link.user_id = ${ownerId} OR CONCAT('owner_', oa.id::text) = ${ownerId})
    `), sql` OR `);
    const ownerResult = await db.execute<OwnerRow>(sql`
      SELECT DISTINCT oa.id AS app_id, oa.email, oa.full_name, link.user_id,
             (SELECT settings.wa_phone FROM owner_notification_settings settings
               WHERE settings.wa_enabled = true AND settings.owner_id IN
                 (COALESCE(link.user_id, CONCAT('owner_', oa.id::text)), CONCAT('owner_', oa.id::text))
               ORDER BY settings.updated_at DESC LIMIT 1) AS wa_phone,
             EXISTS(SELECT 1 FROM owner_notification_settings settings
               WHERE settings.wa_enabled = true AND settings.owner_id IN
                 (COALESCE(link.user_id, CONCAT('owner_', oa.id::text)), CONCAT('owner_', oa.id::text))) AS wa_settings_enabled,
             oa.whatsapp_news_subscribe, oa.whatsapp_subscribed_at
      FROM owner_applications oa
      LEFT JOIN owner_account_links link ON link.owner_application_id = oa.id
      WHERE ${matches}
    `);
    for (const row of (ownerResult as any).rows as OwnerRow[]) {
      const recipient = appRecipient(row);
      ownerAliases.set(`owner_${row.app_id}`, recipient);
      if (row.user_id) ownerAliases.set(row.user_id, recipient);
    }
  }

  const unlinkedIds: string[] = [];
  for (const ownerId of sourceOwnerIds) {
    const linked = ownerAliases.get(ownerId);
    if (linked) {
      byCanonicalId.set(linked.key, linked);
      continue;
    }
    const key = recipientKeyForAlias(ownerId, ownerAliases);
    if (!byCanonicalId.has(key)) {
      byCanonicalId.set(key, {
        key,
        ownerId,
        appId: null,
        email: null,
        whatsappPhone: null,
        name: null,
        prefs: defaultBroadcastPreferences(),
      });
    }
    if (!ownerId.startsWith("owner_")) unlinkedIds.push(ownerId);
  }
  for (let offset = 0; offset < unlinkedIds.length; offset += 500) {
    const chunk = [...new Set(unlinkedIds.slice(offset, offset + 500))];
    if (!chunk.length) continue;
    const ids = sql.join(chunk.map(id => sql`${id}`), sql`, `);
    const accountResult = await db.execute<{ id: string; email: string | null; first_name: string | null; last_name: string | null }>(sql`
      SELECT id, email, first_name, last_name FROM users WHERE id IN (${ids})
    `);
    for (const account of (accountResult as any).rows as Array<{
      id: string; email: string | null; first_name: string | null; last_name: string | null;
    }>) {
      const recipient = byCanonicalId.get(`user:${account.id}`);
      if (!recipient) continue;
      recipient.email = account.email;
      recipient.name = [account.first_name, account.last_name].filter(Boolean).join(" ") || null;
    }
  }

  const recipients = deduplicateRecipients([...byCanonicalId.values()]);
  if (!recipients.length) return recipients;
  const prefResult = await db.execute<{
    owner_key: string; in_app: boolean; inbox: boolean; email: boolean; whatsapp: boolean;
  }>(sql`SELECT owner_key, in_app, inbox, email, whatsapp FROM owner_broadcast_preferences`);
  const prefMap = new Map(((prefResult as any).rows as Array<{
    owner_key: string; in_app: boolean; inbox: boolean; email: boolean; whatsapp: boolean;
  }>).map(row => [row.owner_key, row]));
  for (const recipient of recipients) {
    const pref = prefMap.get(recipient.appId !== null ? `app:${recipient.appId}` : `user:${recipient.ownerId}`);
    if (pref) recipient.prefs = mergeBroadcastPreferences(recipient.prefs, {
      inApp: pref.in_app, inbox: pref.inbox, email: pref.email, whatsapp: pref.whatsapp,
    });
  }
  return recipients;
}

function channelCounts(recipients: Recipient[]): Record<Channel, number> {
  return {
    inApp: recipients.filter(row => row.prefs.inApp).length,
    inbox: recipients.filter(row => row.prefs.inbox).length,
    email: recipients.filter(row => row.prefs.email).length,
    whatsapp: recipients.filter(row => row.prefs.whatsapp).length,
  };
}

function readiness() {
  return { inApp: true, inbox: true, email: smtpConfigured(), whatsapp: false };
}

async function getDeliveryCounts(campaignId: number) {
  const result = await db.execute<{ channel: Channel; status: string; count: string }>(sql`
    SELECT channel, status, COUNT(*)::text AS count FROM broadcast_deliveries
    WHERE campaign_id = ${campaignId} GROUP BY channel, status
  `);
  const counts: Record<Channel, { total: number; delivered: number; failed: number; pending: number; sending: number }> = {
    inApp: { total: 0, delivered: 0, failed: 0, pending: 0, sending: 0 },
    inbox: { total: 0, delivered: 0, failed: 0, pending: 0, sending: 0 },
    email: { total: 0, delivered: 0, failed: 0, pending: 0, sending: 0 },
    whatsapp: { total: 0, delivered: 0, failed: 0, pending: 0, sending: 0 },
  };
  for (const row of (result as any).rows as Array<{ channel: Channel; status: string; count: string }>) {
    const channel = counts[row.channel];
    if (!channel) continue;
    const count = Number(row.count);
    channel.total += count;
    if (row.status === "delivered" || row.status === "failed" || row.status === "pending" || row.status === "sending") channel[row.status] += count;
  }
  return counts;
}

type DeliveryJob = {
  id: number;
  campaign_id: number;
  recipient_key: string;
  recipient_owner_id: string;
  recipient_email: string | null;
  recipient_whatsapp_phone: string | null;
  recipient_name: string | null;
  channel: Channel;
  title: string;
  body: string;
};

let workerRunning = false;
let smtpTransport: any = null;

function getSmtpTransport(): any {
  if (!smtpConfigured()) return null;
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST!,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      pool: true,
      maxConnections: 5,
      maxMessages: 20,
    });
  }
  return smtpTransport;
}

async function processDelivery(job: DeliveryJob, mailer: any): Promise<void> {
  if (job.channel === "inApp" || job.channel === "inbox") {
    await db.transaction(async tx => {
      if (job.channel === "inApp") {
        await tx.execute(sql`
          INSERT INTO owner_notifications
            (owner_id, type, message, is_read, broadcast_campaign_id, broadcast_recipient_key, created_at)
          VALUES (${job.recipient_owner_id}, 'broadcast', ${`${job.title}\n${job.body}`}, false,
            ${job.campaign_id}, ${job.recipient_key}, now())
          ON CONFLICT (broadcast_campaign_id, broadcast_recipient_key) DO NOTHING
        `);
      } else {
        await tx.execute(sql`
          INSERT INTO owner_broadcast_inbox
            (owner_id, owner_name, subject, message, campaign_id, recipient_key, is_read, created_at)
          VALUES (${job.recipient_owner_id}, ${job.recipient_name}, ${job.title}, ${job.body},
            ${job.campaign_id}, ${job.recipient_key}, false, now())
          ON CONFLICT (campaign_id, recipient_key) DO NOTHING
        `);
      }
      await tx.execute(sql`
        UPDATE broadcast_deliveries SET status = 'delivered', error_code = NULL,
          delivered_at = now(), started_at = NULL, recipient_email = NULL,
          recipient_whatsapp_phone = NULL
        WHERE id = ${job.id} AND status = 'sending'
      `);
    });
    return;
  }

  let errorCode: string | null = null;
  try {
    if (job.channel === "email") {
      if (!mailer) throw new Error("smtp_unavailable");
      const current = await getCurrentEmailAndConsent(job.recipient_key);
      const blockReason = emailDeliveryBlockReason(current.email, current.marketingConsent);
      if (blockReason) {
        errorCode = blockReason;
      } else {
      await mailer.sendMail({
        from: `تكيّة <${process.env.SMTP_USER}>`,
        to: current.email!,
        subject: job.title,
        text: job.body,
        html: `<div dir="rtl"><h2>${escapeHtml(job.title)}</h2><p style="white-space:pre-wrap">${escapeHtml(job.body)}</p></div>`,
      });
      }
    } else {
      throw new Error("whatsapp_transport_unavailable");
    }
  } catch (error) {
    errorCode = error instanceof Error && error.message === "smtp_unavailable"
      ? "transport_unavailable" : "delivery_failed";
  }
  await db.execute(sql`
    UPDATE broadcast_deliveries SET status = ${errorCode ? "failed" : "delivered"},
      error_code = ${errorCode}, delivered_at = ${errorCode ? null : new Date()}, started_at = NULL,
      recipient_email = NULL, recipient_whatsapp_phone = NULL
    WHERE id = ${job.id} AND status = 'sending'
  `);
}

async function getCurrentEmailAndConsent(recipientKey: string): Promise<{
  email: string | null;
  marketingConsent: boolean;
}> {
  const appMatch = /^app:(\d+)$/.exec(recipientKey);
  if (appMatch) {
    const result = await db.execute(sql`
      SELECT oa.email, COALESCE(pref.email, false) AS marketing_consent
      FROM owner_applications oa
      LEFT JOIN owner_broadcast_preferences pref ON pref.owner_key = CONCAT('app:', oa.id::text)
      WHERE oa.id = ${Number(appMatch[1])} LIMIT 1
    `);
    const row = ((result as any).rows as Array<{ email: string | null; marketing_consent: boolean }>)[0];
    return { email: row?.email ?? null, marketingConsent: row?.marketing_consent === true };
  }

  const userMatch = /^user:(.+)$/.exec(recipientKey);
  if (!userMatch) return { email: null, marketingConsent: false };
  const rawUserId = userMatch[1];
  const ownerAliasMatch = /^owner_(\d+)$/.exec(rawUserId);
  if (ownerAliasMatch) {
    const result = await db.execute(sql`
      SELECT oa.email, COALESCE(pref.email, false) AS marketing_consent
      FROM owner_applications oa
      LEFT JOIN owner_broadcast_preferences pref ON pref.owner_key = CONCAT('app:', oa.id::text)
      WHERE oa.id = ${Number(ownerAliasMatch[1])} LIMIT 1
    `);
    const row = ((result as any).rows as Array<{ email: string | null; marketing_consent: boolean }>)[0];
    return { email: row?.email ?? null, marketingConsent: row?.marketing_consent === true };
  }

  const result = await db.execute(sql`
    SELECT COALESCE(oa.email, u.email) AS email,
      COALESCE(app_pref.email, user_pref.email, false) AS marketing_consent
    FROM users u
    LEFT JOIN owner_account_links link ON link.user_id = u.id
    LEFT JOIN owner_applications oa ON oa.id = link.owner_application_id
    LEFT JOIN owner_broadcast_preferences app_pref ON app_pref.owner_key = CONCAT('app:', link.owner_application_id::text)
    LEFT JOIN owner_broadcast_preferences user_pref ON user_pref.owner_key = CONCAT('user:', u.id)
    WHERE u.id = ${rawUserId} LIMIT 1
  `);
  const row = ((result as any).rows as Array<{ email: string | null; marketing_consent: boolean }>)[0];
  return { email: row?.email ?? null, marketingConsent: row?.marketing_consent === true };
}

async function drainBroadcastQueue(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    // Internal writes can be retried: their destination records have unique campaign/recipient keys
    // and are committed atomically with the delivery status. SMTP outcomes are ambiguous after a
    // crash, so stale "sending" rows become explicit failures rather than risking duplicate mail.
    await db.execute(sql`
      UPDATE broadcast_deliveries
      SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
        error_code = CASE WHEN attempts >= 5 THEN 'max_attempts_exhausted' ELSE NULL END,
        started_at = NULL
      WHERE status = 'sending' AND channel IN ('inApp', 'inbox')
        AND started_at < now() - interval '2 minutes'
    `);
    await db.execute(sql`
      UPDATE broadcast_deliveries SET status = 'failed',
        error_code = 'delivery_outcome_unknown', started_at = NULL
      WHERE status = 'sending' AND channel = 'email'
        AND started_at < now() - interval '2 minutes'
    `);
    const claimed = await db.execute(sql`
      WITH candidates AS (
        SELECT id FROM broadcast_deliveries
        WHERE status = 'pending' AND attempts < 5 AND channel IN ('inApp', 'inbox', 'email')
        ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 25
      )
      UPDATE broadcast_deliveries d
      SET status = 'sending', attempts = attempts + 1, started_at = now()
      FROM candidates c, broadcast_campaigns campaign
      WHERE d.id = c.id AND campaign.id = d.campaign_id
      RETURNING d.id, d.campaign_id, d.recipient_key, d.recipient_owner_id,
        d.recipient_email, d.recipient_whatsapp_phone, d.recipient_name, d.channel,
        campaign.title, campaign.body
    `);
    const jobs = (claimed as any).rows as DeliveryJob[];
    const mailer = getSmtpTransport();
    for (let index = 0; index < jobs.length; index += 5) {
      await Promise.all(jobs.slice(index, index + 5).map(job => processDelivery(job, mailer)));
    }
  } catch {
    logger.error("Broadcast delivery queue batch failed; pending rows will be retried");
  } finally {
    workerRunning = false;
  }
}

const broadcastQueueTimer = setInterval(() => { void drainBroadcastQueue(); }, 3_000);
broadcastQueueTimer.unref();

router.get("/preview", async (req, res): Promise<void> => {
  const parsed = audienceSchema.safeParse(req.query.audience);
  if (!parsed.success) {
    res.status(400).json({ error: "audience must be all, active, or providers" });
    return;
  }
  const recipients = await getRecipients(parsed.data);
  res.json({ total: recipients.length, byChannel: channelCounts(recipients), readiness: readiness() });
});

router.get("/", async (_req, res): Promise<void> => {
  const result = await db.execute<{
    id: number; title: string; body: string; audience: string; channels: Channel[]; created_at: Date;
  }>(sql`
    SELECT id, title, body, audience, channels, created_at
    FROM broadcast_campaigns ORDER BY created_at DESC, id DESC LIMIT 100
  `);
  const rows = (result as any).rows as Array<{
    id: number; title: string; body: string; audience: string; channels: Channel[]; created_at: Date;
  }>;
  const campaigns = await Promise.all(rows.map(async row => ({
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    channels: row.channels,
    createdAt: row.created_at,
    counts: await getDeliveryCounts(row.id),
  })));
  res.json({ rows: campaigns });
});

router.post("/", async (req, res): Promise<void> => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid broadcast body", details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const idempotencyKey = req.get("Idempotency-Key")?.trim();
  if (!idempotencyKey) {
    res.status(400).json({ error: "Idempotency-Key header is required for retry-safe broadcast creation" });
    return;
  }
  if (idempotencyKey.length > 200) {
    res.status(400).json({ error: "Idempotency-Key is too long" });
    return;
  }

  const previousCampaignResult = await db.execute(sql`
    SELECT id, title, body, audience, channels FROM broadcast_campaigns
    WHERE idempotency_key = ${idempotencyKey} LIMIT 1
  `);
  const previousCampaign = ((previousCampaignResult as any).rows as Array<{
    id: number; title: string; body: string; audience: string; channels: string[];
  }>)[0];
  if (previousCampaign) {
    if (!idempotencyPayloadMatches(previousCampaign, data)) {
      res.status(409).json({ error: "Idempotency-Key was already used for a different broadcast" });
      return;
    }
    const counts = await getDeliveryCounts(Number(previousCampaign.id));
    void drainBroadcastQueue();
    res.status(202).json({ id: Number(previousCampaign.id), counts });
    return;
  }

  const recipients = await getRecipients(data.audience);
  if (recipients.length > 5000) {
    res.status(413).json({ error: "Audience exceeds the 5000-recipient broadcast limit" });
    return;
  }
  const selected = data.channels as Channel[];
  const applicable = recipients.filter(recipient => selected.some(channel => recipient.prefs[channel]));
  const applicableCounts = channelCounts(applicable);
  if (selected.includes("email") && applicableCounts.email > 0 && !smtpConfigured()) {
    res.status(503).json({ error: "Email transport is unavailable: configure SMTP_HOST, SMTP_USER, and SMTP_PASS" });
    return;
  }
  if (selected.includes("whatsapp") && applicableCounts.whatsapp > 0) {
    res.status(503).json({ error: "WhatsApp delivery is unavailable: no WhatsApp transport is configured" });
    return;
  }

  const deliveryPlans = applicable.flatMap(recipient => selected
    .filter(channel => recipient.prefs[channel])
    .map(channel => ({ recipient, channel })));
  let creation: { campaignId: number; isExisting: boolean; idempotencyConflict: boolean };
  try {
    creation = await db.transaction(async tx => {
      const createResult = await tx.execute(sql`
        INSERT INTO broadcast_campaigns (title, body, audience, channels, idempotency_key, created_by)
        VALUES (${data.title}, ${data.body}, ${data.audience}, ${`{${selected.join(",")}}`}::text[], ${idempotencyKey}, ${String((req as any).adminStaff?.id ?? (req as any).user?.id ?? "superadmin")})
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id
      `);
      let inserted = ((createResult as any).rows as Array<{ id: number }>)[0];
      let isExisting = false;
      let idempotencyConflict = false;
      if (!inserted) {
        const existingResult = await tx.execute(sql`
          SELECT id, title, body, audience, channels FROM broadcast_campaigns
          WHERE idempotency_key = ${idempotencyKey} LIMIT 1
        `);
        const existing = ((existingResult as any).rows as Array<{
          id: number; title: string; body: string; audience: string; channels: string[];
        }>)[0];
        inserted = existing;
        isExisting = true;
        idempotencyConflict = !!existing && !idempotencyPayloadMatches(existing, data);
      }
      if (!inserted) throw new Error("broadcast_campaign_insert_failed");
      const campaignId = Number(inserted.id);
      if (!isExisting) {
        for (let offset = 0; offset < deliveryPlans.length; offset += 1000) {
          const chunk = deliveryPlans.slice(offset, offset + 1000);
          const values = sql.join(chunk.map(({ recipient, channel }) => sql`(
            ${campaignId}, ${recipient.key}, ${recipient.ownerId}, ${recipient.email},
            ${recipient.whatsappPhone}, ${recipient.name}, ${channel}, 'pending'
          )`), sql`, `);
          await tx.execute(sql`
            INSERT INTO broadcast_deliveries
              (campaign_id, recipient_key, recipient_owner_id, recipient_email,
               recipient_whatsapp_phone, recipient_name, channel, status)
            VALUES ${values}
            ON CONFLICT (campaign_id, recipient_key, channel) DO NOTHING
          `);
        }
      }
      return { campaignId, isExisting, idempotencyConflict };
    });
  } catch {
    res.status(500).json({ error: "Unable to persist broadcast campaign and recipient statuses" });
    return;
  }
  const campaignId = creation.campaignId;
  if (creation.idempotencyConflict) {
    res.status(409).json({ error: "Idempotency-Key was already used for a different broadcast" });
    return;
  }

  void drainBroadcastQueue();
  res.status(202).json({ id: campaignId, counts: await getDeliveryCounts(campaignId) });
});

export default router;