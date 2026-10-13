import type { Request, Response } from "express";
import { db, photographersTable, photographerSessionsTable } from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

export const PHOTOGRAPHER_COOKIE = "photographer_session";
export const PHOTOGRAPHER_COOKIE_PATH = "/api/photography";
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
  // Migrate the legacy root cookie without touching independently authenticated roles.
  res.clearCookie(PHOTOGRAPHER_COOKIE, { path: "/" });
  res.cookie(PHOTOGRAPHER_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: req.secure || process.env.NODE_ENV === "production", maxAge, path: PHOTOGRAPHER_COOKIE_PATH });
}
