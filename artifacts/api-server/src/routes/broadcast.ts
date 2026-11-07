import { Router } from "express";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db, adminAuditLogsTable } from "@workspace/db";
import { broadcastCampaignsTable, broadcastDeliveriesTable, broadcastSmtpSettingsTable, ownerBroadcastInboxTable } from "@workspace/db";
import { ownerNotificationsQueryTable } from "@workspace/db/runtime-models";
import { insertRecords, updateRecords, writeRecords } from "@workspace/db/mutations";
import { addSqlMinutes,sqlOwnerId,sqlText,sqlBoolean } from "@workspace/db/sql-expressions";
import { z } from "zod";
import { logger } from "../lib/logger";
import {
  broadcastSmtpTransportKey,
  createBroadcastSmtpTransport,
  encryptBroadcastSmtpPassword,
  loadBroadcastSmtpConfig,
  smtpVerificationError,
  invalidateBroadcastSmtpVerificationCache,
  isSafeSmtpHostInput,
  isSafeSmtpTransport,
  resolvePublicSmtpAddresses,
  smtpAuthenticationDestinationMatches,
  verifyBroadcastSmtpConfig,
  type BroadcastSmtpConfig,
} from "../lib/broadcast-smtp-config";
import {
  defaultBroadcastPreferences,
  deduplicateRecipients,
  emailDeliveryBlockReason,
  idempotencyPayloadMatches,
  mergeBroadcastPreferences,
  normalizeE164Phone,
  optedInBroadcastChannels,
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
const recipientsQuerySchema = z.object({
  audience: audienceSchema,
  channels: z.string().transform(value => value.split(","))
    .pipe(z.array(z.enum(channels)).min(1).max(4)
      .refine(values => new Set(values).size === values.length, "Duplicate channels are not allowed"))
    .optional(),
}).strict();
const smtpSettingsSchema = z.object({
  host: z.string().trim().min(1).max(255).refine(isSafeSmtpHostInput, "Unsafe SMTP hostname"),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().trim().min(1).max(320),
  fromAddress: z.string().trim().email().max(320),
  password: z.string().max(1024).optional(),
}).strict().refine(settings => isSafeSmtpTransport(settings.port, settings.secure), {
  message: "SMTP must use a secure SMTP port and TLS or required STARTTLS",
  path: ["port"],
});
const MAX_RECIPIENT_PREVIEW_BYTES = 1_048_576;

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

async function smtpStatus() {
  const loaded = await loadBroadcastSmtpConfig();
  const settings = loaded.storedSettings ?? (loaded.config ? {
    host: loaded.config.host,
    port: loaded.config.port,
    secure: loaded.config.secure,
    username: loaded.config.username,
    fromAddress: loaded.config.fromAddress,
  } : null);
  const config = loaded.config;
  const ready = config ? await verifyBroadcastSmtpConfig(config) : false;
  const email = {
    host: settings?.host ?? null,
    port: settings?.port ?? null,
    secure: settings?.secure ?? false,
    username: settings?.username ?? null,
    fromAddress: settings?.fromAddress ?? null,
    passwordConfigured: loaded.passwordConfigured,
    ready,
    source: loaded.source,
    ...(!ready ? {
      error: loaded.decryptionFailed
        ? "SMTP credentials cannot be decrypted; confirm the encryption key is unchanged"
        : config ? smtpVerificationError : "SMTP is not configured",
    } : {}),
  };
  return { email, whatsapp: { ready: false as const } };
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
      (link.user_id = ${ownerId} OR ${sqlOwnerId(sql`oa.id`)} = ${ownerId})
    `), sql` OR `);
    const ownerResult = await db.execute<OwnerRow>(sql`
      SELECT DISTINCT oa.id AS app_id, oa.email, oa.full_name, link.user_id,
             (SELECT settings.wa_phone FROM owner_notification_settings settings
               WHERE settings.wa_enabled = true AND settings.owner_id IN
                 (COALESCE(link.user_id, ${sqlOwnerId(sql`oa.id`)}), ${sqlOwnerId(sql`oa.id`)})
               ORDER BY settings.updated_at DESC LIMIT 1) AS wa_phone,
             ${sqlBoolean(sql`EXISTS(SELECT 1 FROM owner_notification_settings settings
               WHERE settings.wa_enabled = true AND settings.owner_id IN
                 (COALESCE(link.user_id, ${sqlOwnerId(sql`oa.id`)}), ${sqlOwnerId(sql`oa.id`)}))`,"wa_settings_enabled")} AS wa_settings_enabled,
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

async function getDeliveryCounts(campaignId: number) {
  const result = await db.execute<{ channel: Channel; status: string; count: string }>(sql`
    SELECT channel, status, ${sqlText(sql`COUNT(*)`)} AS count FROM broadcast_deliveries
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
let smtpTransportKey: string | null = null;
let smtpFromAddress: string | null = null;

function invalidateSmtpTransport(): void {
  smtpTransport?.close();
  smtpTransport = null;
  smtpTransportKey = null;
  smtpFromAddress = null;
}

async function getSmtpTransport(): Promise<{ transport: any; fromAddress: string } | null> {
  const loaded = await loadBroadcastSmtpConfig();
  if (!loaded.config) {
    invalidateSmtpTransport();
    return null;
  }
  if (!isSafeSmtpHostInput(loaded.config.host)
    || !isSafeSmtpTransport(loaded.config.port, loaded.config.secure)) {
    invalidateSmtpTransport();
    return null;
  }
  let address: string;
  try {
    [address] = await resolvePublicSmtpAddresses(loaded.config.host);
  } catch {
    invalidateSmtpTransport();
    return null;
  }
  const key = `${broadcastSmtpTransportKey(loaded.config)}:${address}`;
  if (smtpTransportKey !== key) {
    invalidateSmtpTransport();
    smtpTransport = createBroadcastSmtpTransport(loaded.config, address);
    smtpTransportKey = key;
    smtpFromAddress = loaded.config.fromAddress;
  }
  return { transport: smtpTransport, fromAddress: smtpFromAddress! };
}

async function processDelivery(job: DeliveryJob, mailer: any): Promise<void> {
  if (job.channel === "inApp" || job.channel === "inbox") {
    await db.transaction(async tx => {
      if (job.channel === "inApp") {
        await writeRecords(tx, ownerNotificationsQueryTable, {
          ownerId: job.recipient_owner_id, type: "broadcast", message: `${job.title}\n${job.body}`,
          isRead: false, broadcastCampaignId: job.campaign_id, broadcastRecipientKey: job.recipient_key,
        }, { conflict: { action: "ignore",
          target: [ownerNotificationsQueryTable.broadcastCampaignId, ownerNotificationsQueryTable.broadcastRecipientKey] } });
      } else {
        await writeRecords(tx, ownerBroadcastInboxTable, {
          ownerId: job.recipient_owner_id, ownerName: job.recipient_name, subject: job.title,
          message: job.body, campaignId: job.campaign_id, recipientKey: job.recipient_key, isRead: false,
        }, { conflict: { action: "ignore", target: [ownerBroadcastInboxTable.campaignId, ownerBroadcastInboxTable.recipientKey] } });
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
      await mailer.transport.sendMail({
        from: `تكيّة <${mailer.fromAddress}>`,
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
      SELECT oa.email, ${sqlBoolean(sql`COALESCE(pref.email, false)`,"marketing_consent")} AS marketing_consent
      FROM owner_applications oa
      LEFT JOIN owner_broadcast_preferences pref ON pref.owner_key = CONCAT('app:', ${sqlText(sql`oa.id`)})
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
      SELECT oa.email, ${sqlBoolean(sql`COALESCE(pref.email, false)`,"marketing_consent")} AS marketing_consent
      FROM owner_applications oa
      LEFT JOIN owner_broadcast_preferences pref ON pref.owner_key = CONCAT('app:', ${sqlText(sql`oa.id`)})
      WHERE oa.id = ${Number(ownerAliasMatch[1])} LIMIT 1
    `);
    const row = ((result as any).rows as Array<{ email: string | null; marketing_consent: boolean }>)[0];
    return { email: row?.email ?? null, marketingConsent: row?.marketing_consent === true };
  }

  const result = await db.execute(sql`
    SELECT COALESCE(oa.email, u.email) AS email,
      ${sqlBoolean(sql`COALESCE(app_pref.email, user_pref.email, false)`,"marketing_consent")} AS marketing_consent
    FROM users u
    LEFT JOIN owner_account_links link ON link.user_id = u.id
    LEFT JOIN owner_applications oa ON oa.id = link.owner_application_id
    LEFT JOIN owner_broadcast_preferences app_pref ON app_pref.owner_key = CONCAT('app:', ${sqlText(sql`link.owner_application_id`)})
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
        AND started_at < ${addSqlMinutes(sql`NOW()`, -2)}
    `);
    await db.execute(sql`
      UPDATE broadcast_deliveries SET status = 'failed',
        error_code = 'delivery_outcome_unknown', started_at = NULL
      WHERE status = 'sending' AND channel = 'email'
        AND started_at < ${addSqlMinutes(sql`NOW()`, -2)}
    `);
    const jobs = await db.transaction(async tx => {
      const pending = await tx.select().from(broadcastDeliveriesTable)
        .where(and(eq(broadcastDeliveriesTable.status, "pending"), lt(broadcastDeliveriesTable.attempts, 5),
          inArray(broadcastDeliveriesTable.channel, ["inApp", "inbox", "email"])))
        .orderBy(broadcastDeliveriesTable.id).limit(25).for("update", { skipLocked: true });
      if (!pending.length) return [];
      const campaigns = await tx.select({ id: broadcastCampaignsTable.id, title: broadcastCampaignsTable.title, body: broadcastCampaignsTable.body })
        .from(broadcastCampaignsTable).where(inArray(broadcastCampaignsTable.id, [...new Set(pending.map(row => row.campaignId))]));
      const byId = new Map(campaigns.map(row => [row.id, row]));
      const valid = pending.filter(row => byId.has(row.campaignId));
      if (!valid.length) return [];
      await updateRecords(tx, broadcastDeliveriesTable, {
        status: "sending", attempts: sql`${broadcastDeliveriesTable.attempts} + 1`, startedAt: sql`NOW()`,
      }, inArray(broadcastDeliveriesTable.id, valid.map(row => row.id)));
      return valid.map((row): DeliveryJob => {
        const campaign = byId.get(row.campaignId)!;
        const channel = row.channel;
        if (channel !== "inApp" && channel !== "inbox" && channel !== "email") throw new Error("Invalid claimed delivery channel.");
        return {
          id: row.id, campaign_id: row.campaignId, recipient_key: row.recipientKey,
          recipient_owner_id: row.recipientOwnerId, recipient_email: row.recipientEmail,
          recipient_whatsapp_phone: row.recipientWhatsappPhone, recipient_name: row.recipientName,
          channel, title: campaign.title, body: campaign.body,
        };
      });
    });
    const mailer = await getSmtpTransport();
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

router.get("/settings", async (_req, res): Promise<void> => {
  try {
    res.json(await smtpStatus());
  } catch {
    res.status(503).json({ error: "SMTP settings are unavailable" });
  }
});

router.put("/settings/smtp", async (req, res): Promise<void> => {
  const parsed = smtpSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid SMTP settings", details: parsed.error.flatten() });
    return;
  }

  let loaded;
  try {
    loaded = await loadBroadcastSmtpConfig();
  } catch {
    res.status(503).json({ error: "SMTP settings are unavailable" });
    return;
  }
  let password = parsed.data.password;
  const previousSettings = loaded.storedSettings ?? (loaded.config ? {
    host: loaded.config.host,
    port: loaded.config.port,
    secure: loaded.config.secure,
    username: loaded.config.username,
    fromAddress: loaded.config.fromAddress,
  } : null);
  if (!password) {
    if (previousSettings && !smtpAuthenticationDestinationMatches(previousSettings, parsed.data)) {
      res.status(400).json({ error: "A fresh SMTP password is required when the host, port, or username changes" });
      return;
    }
    password = loaded.config?.password;
    if (!password) {
      res.status(400).json({ error: "A password is required because no usable SMTP password is configured" });
      return;
    }
  }
  const config: BroadcastSmtpConfig = { ...parsed.data, password };
  if (!await verifyBroadcastSmtpConfig(config)) {
    res.status(400).json({ error: smtpVerificationError });
    return;
  }
  const encryptedPassword = encryptBroadcastSmtpPassword(password);
  if (!encryptedPassword) {
    res.status(503).json({ error: "SMTP credential encryption is unavailable; configure BROADCAST_SMTP_ENCRYPTION_KEY or SESSION_SECRET" });
    return;
  }

  const actorId = String((req as any).adminStaff?.id ?? req.user?.id ?? "superadmin");
  const actorName = (req as any).adminStaff?.name
    ?? (req.user as { name?: string } | undefined)?.name
    ?? "Superadmin";
  try {
    await db.transaction(async tx => {
      const smtp = { id: 1, host: config.host, port: config.port, secure: config.secure,
        username: config.username, fromAddress: config.fromAddress, encryptedPassword,
        enabled: true, updatedBy: actorId, updatedAt: sql`NOW()` };
      await writeRecords(tx, broadcastSmtpSettingsTable, smtp, {
        conflict: { action: "update", target: broadcastSmtpSettingsTable.id, set: smtp },
      });
      await tx.insert(adminAuditLogsTable).values({
        actorId,
        actorName,
        action: "put_broadcast_smtp_settings",
        method: "PUT",
        path: "/api/admin/broadcast/settings/smtp",
        entity: "broadcast_smtp_settings",
        entityId: "1",
        metadata: { enabled: true, source: "database" },
      });
    });
  } catch {
    res.status(503).json({ error: "Unable to save SMTP settings" });
    return;
  }

  invalidateSmtpTransport();
  invalidateBroadcastSmtpVerificationCache();
  res.json({
    email: {
      host: config.host,
      port: config.port,
      secure: config.secure,
      username: config.username,
      fromAddress: config.fromAddress,
      passwordConfigured: true,
      ready: true,
      source: "database",
    },
    whatsapp: { ready: false },
  });
});

router.delete("/settings/smtp", async (req, res): Promise<void> => {
  const actorId = String((req as any).adminStaff?.id ?? req.user?.id ?? "superadmin");
  const actorName = (req as any).adminStaff?.name
    ?? (req.user as { name?: string } | undefined)?.name
    ?? "Superadmin";
  try {
    await db.transaction(async tx => {
      const smtp = { id: 1, enabled: false, encryptedPassword: null, updatedBy: actorId, updatedAt: sql`NOW()` };
      await writeRecords(tx, broadcastSmtpSettingsTable, smtp, {
        conflict: { action: "update", target: broadcastSmtpSettingsTable.id, set: smtp },
      });
      await tx.insert(adminAuditLogsTable).values({
        actorId,
        actorName,
        action: "delete_broadcast_smtp_settings",
        method: "DELETE",
        path: "/api/admin/broadcast/settings/smtp",
        entity: "broadcast_smtp_settings",
        entityId: "1",
        metadata: { enabled: false },
      });
    });
  } catch {
    res.status(503).json({ error: "Unable to disable SMTP settings" });
    return;
  }
  invalidateSmtpTransport();
  invalidateBroadcastSmtpVerificationCache();
  res.json(await smtpStatus());
});

router.get("/preview", async (req, res): Promise<void> => {
  const parsed = audienceSchema.safeParse(req.query.audience);
  if (!parsed.success) {
    res.status(400).json({ error: "audience must be all, active, or providers" });
    return;
  }
  const recipients = await getRecipients(parsed.data);
  const smtp = await smtpStatus();
  res.json({
    total: recipients.length,
    byChannel: channelCounts(recipients),
    readiness: { inApp: true, inbox: true, email: smtp.email.ready, whatsapp: false },
    transportErrors: smtp.email.ready ? {} : { email: smtp.email.error },
  });
});

router.get("/recipients", async (req, res): Promise<void> => {
  const parsed = recipientsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "audience must be all, active, or providers; channels must be a comma-separated list of valid channels" });
    return;
  }

  const audienceRecipients = await getRecipients(parsed.data.audience);
  if (audienceRecipients.length > 5000) {
    res.status(413).json({ error: "Audience exceeds the 5000-recipient broadcast limit" });
    return;
  }

  const candidates = audienceRecipients.map(recipient => ({
    name: recipient.name?.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || "Owner",
    channels: optedInBroadcastChannels(recipient.prefs, parsed.data.channels),
    sortKey: recipient.key,
  })).filter(recipient => parsed.data.channels === undefined || recipient.channels.length > 0);
  candidates.sort((left, right) => {
    const leftName = left.name.toLowerCase();
    const rightName = right.name.toLowerCase();
    if (leftName < rightName) return -1;
    if (leftName > rightName) return 1;
    return left.sortKey < right.sortKey ? -1 : left.sortKey > right.sortKey ? 1 : 0;
  });

  const recipients = candidates.map(({ name, channels: recipientChannels }, index) => ({
    key: `recipient-${index + 1}`,
    name,
    channels: recipientChannels,
  }));
  const response = { total: recipients.length, recipients };
  if (Buffer.byteLength(JSON.stringify(response), "utf8") > MAX_RECIPIENT_PREVIEW_BYTES) {
    res.status(413).json({ error: "Recipient preview exceeds the response size limit" });
    return;
  }
  res.json(response);
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
  if (selected.includes("email") && applicableCounts.email > 0) {
    let smtp: Awaited<ReturnType<typeof smtpStatus>>;
    try {
      smtp = await smtpStatus();
    } catch {
      res.status(503).json({ error: "Email transport readiness cannot be verified" });
      return;
    }
    if (!smtp.email.ready) {
      res.status(503).json({ error: smtp.email.error ?? "Email transport is unavailable" });
      return;
    }
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
      const createResult = await insertRecords(tx, broadcastCampaignsTable, {
        title: data.title, body: data.body, audience: data.audience, channels: selected,
        idempotencyKey, createdBy: String((req as any).adminStaff?.id ?? req.user?.id ?? "superadmin"),
      }, { conflict: { action: "ignore", target: broadcastCampaignsTable.idempotencyKey },
        returning: { id: broadcastCampaignsTable.id } });
      let inserted: { id: number } | undefined = createResult[0];
      let isExisting = false;
      let idempotencyConflict = false;
      if (!inserted) {
        const [existing] = await tx.select({
          id: broadcastCampaignsTable.id, title: broadcastCampaignsTable.title, body: broadcastCampaignsTable.body,
          audience: broadcastCampaignsTable.audience, channels: broadcastCampaignsTable.channels,
        }).from(broadcastCampaignsTable).where(eq(broadcastCampaignsTable.idempotencyKey, idempotencyKey)).limit(1);
        inserted = existing;
        isExisting = true;
        idempotencyConflict = !!existing && !idempotencyPayloadMatches(existing, data);
      }
      if (!inserted) throw new Error("broadcast_campaign_insert_failed");
      const campaignId = Number(inserted.id);
      if (!isExisting) {
        for (let offset = 0; offset < deliveryPlans.length; offset += 1000) {
          const chunk = deliveryPlans.slice(offset, offset + 1000);
          await writeRecords(tx, broadcastDeliveriesTable, chunk.map(({ recipient, channel }) => ({
            campaignId, recipientKey: recipient.key, recipientOwnerId: recipient.ownerId,
            recipientEmail: recipient.email, recipientWhatsappPhone: recipient.whatsappPhone,
            recipientName: recipient.name, channel, status: "pending",
          })), { conflict: { action: "ignore", target: [
            broadcastDeliveriesTable.campaignId, broadcastDeliveriesTable.recipientKey, broadcastDeliveriesTable.channel,
          ] } });
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