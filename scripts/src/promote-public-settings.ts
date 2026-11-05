/**
 * Manually promote public website settings through the authenticated admin API.
 * No direct production SQL, DDL, automatic startup seeding, or business data.
 * Defaults to a read-only diff. --apply requires the existing admin password.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SOURCE = "http://127.0.0.1:8080";
const TARGET = "https://takyeh.sa";
const PUBLIC_KEYS = [
  "about_page_content", "faq_page_content", "terms_page_content", "privacy_page_content",
  "platform_whatsapp", "whatsapp_message", "platform_email", "instagram_url", "twitter_url",
  "site_title", "site_display_name", "site_logo_url", "logo_size", "logo_position",
  "primary_color", "hero_title", "hero_subtitle", "hero_bg_url", "hero_line1", "hero_line2",
  "hero_word_color", "feature_1", "feature_2", "feature_3", "snapchat_url", "snapchat_show",
  "tiktok_url", "tiktok_show", "instagram_show", "twitter_show", "feat_section_title",
  "feat_section_desc", "feat_card1_title", "feat_card1_text", "feat_card1_icon",
  "feat_card2_title", "feat_card2_text", "feat_card2_icon", "feat_card3_title",
  "feat_card3_text", "feat_card3_icon", "footer_title", "footer_desc", "copyright_text",
  "legal_entity_name_ar", "legal_entity_name_en", "wa_message_template", "wa_review_template",
  "svc_btn_enabled", "svc_btn_label", "svc_btn_color",
] as const;

type Settings = Record<string, string>;
async function readPublicSettings(origin: string): Promise<Settings> {
  const response = await fetch(`${origin}/api/page-content`, {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Public settings read failed: HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid settings response");
  const settings: Settings = {};
  for (const key of PUBLIC_KEYS) {
    const value = (data as Record<string, unknown>)[key];
    if (value !== undefined && typeof value !== "string") throw new Error(`Invalid setting: ${key}`);
    if (typeof value === "string") settings[key] = value;
  }
  return settings;
}

async function run() {
  const [source, previous] = await Promise.all([readPublicSettings(SOURCE), readPublicSettings(TARGET)]);
  // Only explicitly saved source values participate. Missing values never delete live settings.
  const changes = Object.fromEntries(Object.entries(source).filter(([key, value]) => previous[key] !== value));
  const keys = Object.keys(changes);
  console.log(JSON.stringify({ target: TARGET, changedKeys: keys, count: keys.length, apply: process.argv.includes("--apply") }));
  if (!keys.length || !process.argv.includes("--apply")) return;

  const password = process.env.LIVE_ADMIN_PASSWORD;
  const username = process.env.LIVE_ADMIN_USERNAME;
  if (!password || !username) throw new Error("Live administrator credentials unavailable; no live settings changed.");

  // Verify images before promotion; never point live branding at a dev-only or missing file.
  for (const key of ["site_logo_url", "hero_bg_url"]) {
    if (!changes[key]) continue;
    const url = new URL(changes[key], TARGET);
    if (url.protocol !== "https:" || url.origin !== TARGET) throw new Error(`Unapproved asset origin: ${key}`);
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) {
      throw new Error(`Live branding image unavailable: ${key}`);
    }
    await response.arrayBuffer();
  }

  const login = await fetch(`${TARGET}/api/admin-staff/login`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!login.ok) throw new Error(`Live admin authentication failed: HTTP ${login.status}; no settings changed.`);
  const cookie = login.headers.getSetCookie()
    .map(value => value.split(";")[0]).find(value => value.startsWith("admin_staff_sid="));
  if (!cookie) throw new Error("Admin session cookie missing; no settings changed.");
  try {
    const identity = await fetch(`${TARGET}/api/admin-staff/me`, {
      headers: { Cookie: cookie }, redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    const me = await identity.json() as { adminStaff?: { isSuperAdmin?: boolean } };
    if (!identity.ok || !me.adminStaff?.isSuperAdmin) throw new Error("Live account is not a superadmin; no settings changed.");
    const [freshSource, freshTarget] = await Promise.all([readPublicSettings(SOURCE), readPublicSettings(TARGET)]);
    if (keys.some(key => freshTarget[key] !== previous[key] || freshSource[key] !== source[key])) {
      throw new Error("Settings changed during review; refusing to overwrite concurrent changes.");
    }
    const backupDirectory = resolve(process.cwd(), "../.local/settings-sync-backups");
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    const backupPath = resolve(backupDirectory, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(backupPath, JSON.stringify({
      target: TARGET, createdAt: new Date().toISOString(), keys,
      before: Object.fromEntries(keys.map(key => [key, previous[key] ?? null])),
      after: changes,
    }, null, 2), { mode: 0o600, flag: "wx" });

    const saved = await fetch(`${TARGET}/api/admin/settings`, {
      method: "PATCH", redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (!saved.ok) throw new Error(`Save response HTTP ${saved.status}; check live values before retrying.`);
    const result = await readPublicSettings(TARGET);
    const unmatched = keys.filter(key => result[key] !== changes[key]);
    if (unmatched.length) throw new Error(`Read-back mismatch: ${unmatched.join(", ")}`);
    console.log(JSON.stringify({ synced: true, verifiedKeys: keys, backupSaved: true, businessDataChanged: false }));
  } finally {
    const logout = await fetch(`${TARGET}/api/admin-staff/logout`, {
      method: "POST", headers: { Cookie: cookie }, redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    if (!logout.ok) throw new Error(`Maintenance session logout failed: HTTP ${logout.status}`);
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : "Public settings promotion failed");
  process.exitCode = 1;
});
