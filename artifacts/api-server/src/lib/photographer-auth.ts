import type { Request, Response } from "express";
import { db, photographersTable, photographerSessionsTable } from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

export const PHOTOGRAPHER_COOKIE = "photographer_session";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export async function getPhotographer(req: Request) {
  const token = req.cookies?.[PHOTOGRAPHER_COOKIE];
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [session] = await db.select().from(photographerSessionsTable).where(and(
    eq(photographerSessionsTable.hash, hash(token)), gt(photographerSessionsTable.expiresAt, new Date()),
  ));
  if (!session) return null;
  const [row] = await db.select().from(photographersTable).where(eq(photographersTable.id, session.photographerId));
  return row ?? null;
}
export async function setPhotographerSession(req: Request, res: Response, id: number, rememberMe = false) {
  const token = randomBytes(32).toString("hex");
  const maxAge = (rememberMe ? 30 : 14) * 86400000;
  await db.insert(photographerSessionsTable).values({ hash: hash(token), photographerId: id, expiresAt: new Date(Date.now() + maxAge) });
  res.cookie(PHOTOGRAPHER_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge, path: "/" });
}
const attempts = new Map<string, { count: number; until: number }>();
/** Called only as a fallback when existing owner credentials did not authenticate. */
export async function tryPhotographerLogin(req: Request, res: Response, identifier: string, password: unknown, rememberMe: boolean) {
  const digits = identifier.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[\s()+-]/g, "")
    .replace(/^00966/, "966").replace(/^0(?=5)/, "966").replace(/^5/, "9665");
  if (!/^9665\d{8}$/.test(digits) || typeof password !== "string" || password.length > 128) return false;
  const key = hash(`${req.ip}:${digits}`), now = Date.now();
  if (attempts.size > 2000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  const attempt = attempts.get(key);
  if (attempt && attempt.until > now && attempt.count >= 10) {
    res.status(429).json({ error: "محاولات كثيرة؛ أعد المحاولة لاحقاً" }); return true;
  }
  attempts.set(key, attempt && attempt.until > now ? { ...attempt, count: attempt.count + 1 } : { count: 1, until: now + 600000 });
  const [row] = await db.select().from(photographersTable).where(eq(photographersTable.whatsapp, digits));
  if (!row?.passwordHash || !await bcrypt.compare(password, row.passwordHash)) return false;
  attempts.delete(key);
  await setPhotographerSession(req, res, row.id, rememberMe);
  // A photographer session is never an owner/admin session.
  res.clearCookie("sid", { path: "/" });
  res.clearCookie("staff_sid", { path: "/" });
  res.clearCookie("admin_staff_sid", { path: "/" });
  res.json({ ok: true, redirect: "/photographer", role: "photographer" });
  return true;
}
