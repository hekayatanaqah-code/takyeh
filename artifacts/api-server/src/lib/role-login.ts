import type { Request, Response, NextFunction } from "express";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, sessionsTable, staffSessionsTable, adminSessionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { RoleLoginBody, SelectLoginRoleBody } from "@workspace/api-zod";
import { createSession, SESSION_COOKIE, SESSION_TTL } from "./auth";
import { setPhotographerSession } from "./photographer-auth";

type Role = "owner" | "photographer" | "admin" | "staff";
type Candidate = { role: Role; id: number; password_hash: string };
type Proof = { key: string; fingerprint: string; verified: boolean };
type Challenge = { roleLogin: true; identifier: string; rememberMe: boolean; proofs: Proof[]; attempts: number };
const COOKIE = "role_login_challenge";
const labels: Record<Role, string> = { owner: "إدارة الشاليهات والخدمات", photographer: "لوحة المصور", admin: "لوحة الإدارة", staff: "لوحة الموظف" };
const keyOf = (c: Candidate) => `${c.role}:${c.id}`;
const fingerprint = (c: Candidate) => createHash("sha256").update(c.password_hash).digest("hex");
const cookieOptions = (req: Request) => ({ httpOnly: true, secure: req.secure || process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/auth" });
export const roleLoginBody = RoleLoginBody;
export const roleSelectBody = SelectLoginRoleBody;

/** Numeric passwords accept equivalent digit scripts; other passwords remain exact. */
export function normalizeNumericLoginPassword(value: string): string {
  if (!/^[0-9٠-٩۰-۹]+$/.test(value)) return value;
  return value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

async function verifyLoginPassword(value: string, hash: string): Promise<boolean> {
  // Keep historical exact-script passwords valid before trying canonical digits.
  if (await bcrypt.compare(value, hash)) return true;
  const normalized = normalizeNumericLoginPassword(value);
  return normalized !== value && await bcrypt.compare(normalized, hash);
}

export function normalizeRolePhone(value: string) {
  const digits = value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[\s()+-]/g, "")
    .replace(/^(00966|966|0)/, "");
  return /^5\d{8}$/.test(digits) ? digits : "";
}
/** Separate role records remain separate; contacts discover roles, never authorize them. */
async function candidates(identifier: string): Promise<Candidate[]> {
  const phone = normalizeRolePhone(identifier);
  const email = identifier.toLowerCase();
  const result = await db.execute(sql`
    SELECT 'owner' AS role, id, password_hash FROM owner_applications
    WHERE email_verified = true AND deleted_at IS NULL AND password_hash IS NOT NULL AND
      (LOWER(email) = ${email} OR (${phone} <> '' AND
        regexp_replace(regexp_replace(translate(phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^(00966|966|0)', '') = ${phone}))
    UNION ALL
    SELECT 'photographer', id, password_hash FROM photographers
    WHERE password_hash IS NOT NULL AND
      (LOWER(email) = ${email} OR (${phone} <> '' AND regexp_replace(whatsapp, '^(00966|966|0)', '') = ${phone}))
    UNION ALL
    SELECT 'admin', id, password_hash FROM admin_staff
    WHERE is_active = true AND
      (LOWER(email) = ${email} OR username = ${identifier} OR (${phone} <> '' AND
        regexp_replace(regexp_replace(translate(mobile, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^(00966|966|0)', '') = ${phone}))
    UNION ALL
    SELECT 'staff', id, password_hash FROM owner_staff
    WHERE is_active = true AND password_hash IS NOT NULL AND username IS NOT NULL AND
      (LOWER(email) = ${email} OR username = ${identifier} OR (${phone} <> '' AND
        regexp_replace(regexp_replace(translate(phone_num, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^(00966|966|0)', '') = ${phone}))
    LIMIT 20
  `);
  return (result as unknown as { rows: Candidate[] }).rows;
}
const attempts = new Map<string, { count: number; until: number }>();
export function roleLoginGuard(req: Request, res: Response, next: NextFunction) {
  const origin = req.get("origin");
  const host = req.get("x-forwarded-host")?.split(",")[0].trim() || req.get("host");
  try { if (!origin || new URL(origin).host !== host) { res.status(403).json({ error: "طلب غير مسموح من خارج المنصة" }); return; } }
  catch { res.status(403).json({ error: "طلب غير مسموح" }); return; }
  const identifier = (typeof req.body?.identifier === "string" ? req.body.identifier : typeof req.cookies?.[COOKIE] === "string" ? req.cookies[COOKIE] : "").trim().toLowerCase().slice(0, 160);
  const now = Date.now(), key = `${req.ip}:${createHash("sha256").update(normalizeRolePhone(identifier) || identifier).digest("hex")}`;
  if (attempts.size > 2000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  const previous = attempts.get(key);
  const entry = previous && previous.until > now ? previous : { count: 0, until: now + 600000 };
  attempts.set(key, entry);
  if (++entry.count > 30) { res.status(429).json({ error: "محاولات كثيرة؛ أعد المحاولة لاحقاً" }); return; }
  next();
}
async function clearChallenge(req: Request, res: Response) {
  const token = req.cookies?.[COOKIE];
  if (typeof token === "string" && /^[a-f0-9]{64}$/.test(token)) {
    // Only remove challenge records, never a normal authenticated session.
    await db.execute(sql`DELETE FROM sessions WHERE sid = ${token} AND sess ->> 'roleLogin' = 'true'`);
  }
  res.clearCookie(COOKIE, cookieOptions(req));
}
async function issueSession(req: Request, res: Response, candidate: Candidate, rememberMe: boolean) {
  const ttl = rememberMe ? 30 * 86400000 : SESSION_TTL;
  const options = { httpOnly: true, secure: req.secure || process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", ...(rememberMe ? { maxAge: ttl } : {}) };
  if (candidate.role === "photographer") {
    await setPhotographerSession(req, res, candidate.id, rememberMe);
    return { ok: true, role: candidate.role, redirect: "/photographer" };
  }
  if (candidate.role === "owner") {
    const result = await db.execute(sql`SELECT oa.id, oa.email, oa.full_name, link.user_id FROM owner_applications oa
      LEFT JOIN owner_account_links link ON link.owner_application_id=oa.id WHERE oa.id = ${candidate.id}`);
    const row = (result as any).rows[0];
    // Preserve established ordinary owner identities through durable links, not email matching.
    // A privileged external identity must not give an owner login administrative powers.
    const privilegedIds = new Set([process.env.ADMIN_USER_ID, ...(process.env.PLATFORM_ADMIN_IDS ?? "56719001").split(",").map(s => s.trim())]);
    const linked = typeof row.user_id === "string" && !/^owner_\d+$/.test(row.user_id) && !privilegedIds.has(row.user_id) ? row.user_id : null;
    const userId = linked ?? `owner_${row.id}`;
    const sid = await createSession({
      user: { id: userId, email: row.email, firstName: row.full_name, lastName: null, profileImageUrl: null },
      access_token: "owner_password_auth", ownerApplicationId: row.id, expires_at: Math.floor((Date.now() + ttl) / 1000),
    }, ttl);
    res.cookie(SESSION_COOKIE, sid, options);
    // Owner and owner-staff share /dashboard, so explicitly replace only that conflicting context.
    res.clearCookie("staff_sid", { path: "/" });
    res.clearCookie("owner_temp_session", { path: "/" });
    return { ok: true, role: candidate.role, redirect: "/dashboard" };
  }
  const sid = randomBytes(32).toString("hex");
  const expire = new Date(Date.now() + (rememberMe ? ttl : 86400000));
  if (candidate.role === "admin") {
    await db.insert(adminSessionsTable).values({ sid, adminStaffId: candidate.id, expire });
    res.cookie("admin_staff_sid", sid, options);
    return { ok: true, role: "admin", redirect: "/admin" };
  }
  const result = await db.execute(sql`SELECT owner_id FROM owner_staff WHERE id = ${candidate.id}`);
  await db.insert(staffSessionsTable).values({ sid, staffId: candidate.id, ownerId: (result as any).rows[0].owner_id, expire });
  res.cookie("staff_sid", sid, options);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.clearCookie("owner_temp_session", { path: "/" });
  return { ok: true, role: "staff", redirect: "/dashboard" };
}
export async function loginWithRoles(req: Request, res: Response) {
  const rawIdentifier = req.body?.identifier ?? req.body?.email;
  const body = roleLoginBody.safeParse({ ...req.body, identifier: typeof rawIdentifier === "string" ? rawIdentifier.trim() : rawIdentifier });
  if (!body.success) { res.status(400).json({ error: "أدخل الجوال أو البريد أو اسم المستخدم وكلمة المرور" }); return; }
  const list = await candidates(body.data.identifier);
  const proofs: Proof[] = [];
  for (const c of list) proofs.push({ key: keyOf(c), fingerprint: fingerprint(c), verified: await verifyLoginPassword(body.data.password, c.password_hash) });
  if (!proofs.some(p => p.verified)) { res.status(401).json({ error: "بيانات الدخول غير صحيحة" }); return; }
  await clearChallenge(req, res);
  if (list.length === 1) { res.json(await issueSession(req, res, list[0], !!body.data.rememberMe)); return; }
  const token = randomBytes(32).toString("hex");
  const challenge: Challenge = { roleLogin: true, identifier: body.data.identifier, rememberMe: !!body.data.rememberMe, proofs, attempts: 0 };
  await db.insert(sessionsTable).values({ sid: token, sess: challenge, expire: new Date(Date.now() + 300000) });
  res.cookie(COOKIE, token, { ...cookieOptions(req), maxAge: 300000 });
  res.json({ requiresRole: true, roles: list.map((c, i) => ({
    key: keyOf(c), role: c.role, label: labels[c.role] + (list.filter(x => x.role === c.role).length > 1 ? ` (${(i + 1).toLocaleString("ar-SA")})` : ""),
    requiresPassword: !proofs[i].verified,
  })) });
}
export async function selectLoginRole(req: Request, res: Response) {
  const parsed = roleSelectBody.safeParse(req.body), token = req.cookies?.[COOKIE];
  if (!parsed.success || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) { res.status(401).json({ error: "أعد تسجيل الدخول لاختيار الدور" }); return; }
  const result = await db.transaction(async tx => {
    const [row] = await tx.select().from(sessionsTable).where(eq(sessionsTable.sid, token)).for("update");
    const challenge = row?.sess as unknown as Challenge | undefined;
    if (!row || +row.expire <= Date.now() || !challenge?.roleLogin || challenge.attempts >= 5) return null;
    const proof = challenge.proofs.find(p => p.key === parsed.data.key);
    const candidate = (await candidates(challenge.identifier)).find(c => keyOf(c) === parsed.data.key);
    if (!proof || !candidate || proof.fingerprint !== fingerprint(candidate)) return null;
    if (!proof.verified && (!parsed.data.password || !await verifyLoginPassword(parsed.data.password, candidate.password_hash))) {
      await tx.update(sessionsTable).set({ sess: { ...challenge, attempts: challenge.attempts + 1 } }).where(eq(sessionsTable.sid, token));
      return "password" as const;
    }
    await tx.delete(sessionsTable).where(eq(sessionsTable.sid, token));
    return { candidate, rememberMe: challenge.rememberMe };
  });
  if (result === "password") { res.status(401).json({ error: parsed.data.password ? "كلمة المرور الخاصة بالدور المختار غير صحيحة" : "أدخل كلمة المرور الخاصة بالدور المختار" }); return; }
  if (!result) { await clearChallenge(req, res); res.status(401).json({ error: "انتهت صلاحية الاختيار أو تغير الحساب؛ أعد تسجيل الدخول" }); return; }
  res.clearCookie(COOKIE, cookieOptions(req));
  res.json(await issueSession(req, res, result.candidate, result.rememberMe));
}
