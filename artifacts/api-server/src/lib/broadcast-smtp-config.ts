import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export type BroadcastSmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromAddress: string;
  password: string;
};

export type BroadcastSmtpSource = "database" | "environment" | "unavailable";

export type LoadedBroadcastSmtpConfig = {
  config: BroadcastSmtpConfig | null;
  source: BroadcastSmtpSource;
  passwordConfigured: boolean;
  storedSettings: Pick<BroadcastSmtpConfig, "host" | "port" | "secure" | "username" | "fromAddress"> | null;
  decryptionFailed: boolean;
};

const blockedIpv4 = new BlockList();
[
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
].forEach(([range, prefix]) => blockedIpv4.addSubnet(range as string, prefix as number, "ipv4"));

const publicIpv6 = new BlockList();
publicIpv6.addSubnet("2000::", 3, "ipv6");
const blockedIpv6 = new BlockList();
[
  ["2001::", 32], ["2001:2::", 48], ["2001:10::", 28], ["2001:20::", 28],
  ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20],
].forEach(([range, prefix]) => blockedIpv6.addSubnet(range as string, prefix as number, "ipv6"));

function mappedIpv4(address: string): string | null {
  let normalized = address.toLowerCase();
  const dotted = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (dotted) {
    const octets = dotted[2].split(".").map(Number);
    if (octets.some(octet => octet > 255)) return null;
    normalized = `${dotted[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const pieces = normalized.split("::");
  if (pieces.length > 2) return null;
  const left = pieces[0] ? pieces[0].split(":") : [];
  const right = pieces[1] ? pieces[1].split(":") : [];
  const groups = pieces.length === 2
    ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right]
    : left;
  if (groups.length !== 8 || groups.slice(0, 5).some(group => group !== "0") || groups[5] !== "ffff") return null;
  const high = Number.parseInt(groups[6], 16);
  const low = Number.parseInt(groups[7], 16);
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

export function isPublicSmtpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blockedIpv4.check(address, "ipv4");
  if (family !== 6 || address.includes("%")) return false;
  const mapped = mappedIpv4(address);
  if (mapped) return isPublicSmtpAddress(mapped);
  return publicIpv6.check(address, "ipv6") && !blockedIpv6.check(address, "ipv6");
}

export function isSafeSmtpHostInput(input: string): boolean {
  const host = input.trim().toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253 || host.includes("..")) return false;
  if (isIP(host)) return isPublicSmtpAddress(host);
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/.test(host)) return false;
  if (["localhost", "local", "internal", "lan", "home", "home.arpa", "localdomain", "test", "invalid", "example"]
    .some(suffix => host === suffix || host.endsWith(`.${suffix}`))) return false;
  return true;
}

export function isSafeSmtpTransport(port: number, secure: boolean): boolean {
  return [465, 587, 2525].includes(port) && typeof secure === "boolean";
}

export function smtpAuthenticationDestinationMatches(
  previous: Pick<BroadcastSmtpConfig, "host" | "port" | "username">,
  next: Pick<BroadcastSmtpConfig, "host" | "port" | "username">,
): boolean {
  return previous.host.trim().replace(/\.$/, "").toLowerCase()
      === next.host.trim().replace(/\.$/, "").toLowerCase()
    && previous.port === next.port
    && previous.username === next.username;
}

type SmtpLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: number }>>;

export async function resolvePublicSmtpAddresses(
  host: string,
  resolve: SmtpLookup = lookup as unknown as SmtpLookup,
): Promise<string[]> {
  if (isIP(host)) {
    if (!isPublicSmtpAddress(host)) throw new Error("smtp_destination_not_public");
    return [host];
  }
  if (!isSafeSmtpHostInput(host)) throw new Error("smtp_destination_not_public");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await Promise.race([
      resolve(host, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("smtp_dns_timeout")), 3_000);
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  if (!addresses.length || addresses.some(({ address, family }) =>
    family !== isIP(address) || !isPublicSmtpAddress(address))) {
    throw new Error("smtp_destination_not_public");
  }
  return [...new Set(addresses.map(({ address }) => address))];
}

function deriveKey(keyId: "d" | "s"): Buffer | null {
  const configured = keyId === "d"
    ? process.env.BROADCAST_SMTP_ENCRYPTION_KEY
    : process.env.SESSION_SECRET;
  if (!configured) return null;
  let material: Buffer;
  if (keyId === "d") {
    if (/^[0-9a-f]{64}$/i.test(configured)) material = Buffer.from(configured, "hex");
    else {
      material = Buffer.from(configured, "base64");
      if (material.length !== 32) return null;
    }
  } else {
    material = Buffer.from(configured, "utf8");
  }
  return Buffer.from(hkdfSync(
    "sha256",
    material,
    Buffer.from("broadcast-smtp-at-rest-v1", "utf8"),
    Buffer.from("broadcast-smtp-password-encryption", "utf8"),
    32,
  ));
}

function encryptionMaterial(): { key: Buffer; keyId: "d" | "s" } | null {
  const dedicated = deriveKey("d");
  if (dedicated) return { key: dedicated, keyId: "d" };
  const session = deriveKey("s");
  return session ? { key: session, keyId: "s" } : null;
}

export function encryptBroadcastSmtpPassword(password: string): string | null {
  const material = encryptionMaterial();
  if (!material || !password || password.length > 1024) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", material.key, iv);
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return `v1${material.keyId}.${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptBroadcastSmtpPassword(encrypted: string): string | null {
  const [version, ivText, tagText, ciphertextText, ...extra] = encrypted.split(".");
  if (extra.length || (version !== "v1d" && version !== "v1s") || !ivText || !tagText || !ciphertextText) return null;
  const key = deriveKey(version === "v1d" ? "d" : "s");
  if (!key) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64"));
    decipher.setAuthTag(Buffer.from(tagText, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

type StoredSmtpSettingsRow = {
  host: string | null;
  port: number | null;
  secure: boolean;
  username: string | null;
  from_address: string | null;
  encrypted_password: string | null;
  enabled: boolean;
};

export async function loadBroadcastSmtpConfig(): Promise<LoadedBroadcastSmtpConfig> {
  const result = await db.execute<StoredSmtpSettingsRow>(sql`
    SELECT host, port, secure, username, from_address, encrypted_password, enabled
    FROM broadcast_smtp_settings WHERE id = 1 LIMIT 1
  `);
  const row = ((result as any).rows as StoredSmtpSettingsRow[])[0];
  if (row) {
    const storedSettings = row.host && row.port && row.username && row.from_address ? {
      host: row.host,
      port: Number(row.port),
      secure: row.secure,
      username: row.username,
      fromAddress: row.from_address,
    } : null;
    const password = row.encrypted_password
      ? decryptBroadcastSmtpPassword(row.encrypted_password)
      : null;
    return {
      config: row.enabled && password && storedSettings ? { ...storedSettings, password } : null,
      source: "database",
      passwordConfigured: row.enabled && !!row.encrypted_password,
      storedSettings: storedSettings,
      decryptionFailed: row.enabled && !!row.encrypted_password && password === null,
    };
  }

  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    return {
      config: {
        host: SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        username: SMTP_USER,
        fromAddress: process.env.SMTP_FROM_ADDRESS || SMTP_USER,
        password: SMTP_PASS,
      },
      source: "environment",
      passwordConfigured: true,
      storedSettings: null,
      decryptionFailed: false,
    };
  }
  return {
    config: null,
    source: "unavailable",
    passwordConfigured: false,
    storedSettings: null,
    decryptionFailed: false,
  };
}

export function createBroadcastSmtpTransport(
  config: BroadcastSmtpConfig,
  resolvedAddress: string,
  pool = true,
) {
  return nodemailer.createTransport({
    // Connect only to the address vetted by DNS resolution; never let Nodemailer
    // resolve the administrator-provided hostname again.
    host: resolvedAddress,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    ignoreTLS: false,
    tls: {
      ...(isIP(config.host) ? {} : { servername: config.host.replace(/\.$/, "") }),
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
    auth: { user: config.username, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    pool,
    maxConnections: 5,
    maxMessages: 20,
  } as SMTPTransport.Options);
}

export class ShortTtlVerificationCache {
  private readonly entries = new Map<string, { expiresAt: number; promise: Promise<boolean> }>();

  constructor(
    private readonly successTtlMs = 15_000,
    private readonly failureTtlMs = 3_000,
  ) {}

  verify(fingerprint: string, run: () => Promise<boolean>): Promise<boolean> {
    const existing = this.entries.get(fingerprint);
    if (existing && existing.expiresAt > Date.now()) return existing.promise;

    const entry: { expiresAt: number; promise: Promise<boolean> } = {
      expiresAt: Number.POSITIVE_INFINITY,
      promise: Promise.resolve(false),
    };
    entry.promise = Promise.resolve()
      .then(run)
      .catch(() => false)
      .then(result => {
        entry.expiresAt = Date.now() + (result ? this.successTtlMs : this.failureTtlMs);
        return result;
      });
    this.entries.set(fingerprint, entry);
    return entry.promise;
  }

  clear(): void {
    this.entries.clear();
  }
}

const smtpVerificationCache = new ShortTtlVerificationCache();

export function invalidateBroadcastSmtpVerificationCache(): void {
  smtpVerificationCache.clear();
}

async function verifyBroadcastSmtpConfigDirect(config: BroadcastSmtpConfig, address: string): Promise<boolean> {
  if (!isSafeSmtpHostInput(config.host) || !isSafeSmtpTransport(config.port, config.secure)) return false;
  const transport = createBroadcastSmtpTransport(config, address, false);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      transport.verify(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("smtp_verification_timeout")), 10_000);
        timeout.unref();
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
    transport.close();
  }
}

export function broadcastSmtpTransportKey(config: BroadcastSmtpConfig): string {
  return createHash("sha256").update(JSON.stringify([
    config.host, config.port, config.secure, config.username, config.fromAddress, config.password,
  ])).digest("hex");
}

export async function verifyBroadcastSmtpConfig(config: BroadcastSmtpConfig): Promise<boolean> {
  if (!isSafeSmtpHostInput(config.host) || !isSafeSmtpTransport(config.port, config.secure)) return false;
  let addresses: string[];
  try {
    addresses = (await resolvePublicSmtpAddresses(config.host)).sort();
  } catch {
    return false;
  }
  const fingerprint = `${broadcastSmtpTransportKey(config)}:${addresses.join(",")}`;
  return smtpVerificationCache.verify(
    fingerprint,
    () => verifyBroadcastSmtpConfigDirect(config, addresses[0]),
  );
}

export const smtpVerificationError = "SMTP connection verification failed; check the server settings and credentials";