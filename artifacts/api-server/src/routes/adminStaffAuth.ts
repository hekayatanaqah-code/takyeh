import { Router } from "express";
import { db } from "@workspace/db";
import { adminStaffTable, adminSessionsTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { clearSession, getSession, getSessionId } from "../lib/auth";

const router = Router();

const ADMIN_STAFF_COOKIE = "admin_staff_sid";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/* ── POST /admin-staff/login ─── */
router.post("/admin-staff/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: "يرجى إدخال اسم المستخدم وكلمة المرور" });
  }

  const [member] = await db
    .select()
    .from(adminStaffTable)
    .where(eq(adminStaffTable.username, String(username).trim()));

  if (!member || !member.passwordHash) {
    return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  }
  if (!member.isActive) {
    return res.status(403).json({ error: "هذا الحساب موقوف. يرجى التواصل مع المشرف العام" });
  }

  const valid = await bcrypt.compare(String(password), member.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  }

  const sid = crypto.randomBytes(32).toString("hex");
  const expire = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(adminSessionsTable).values({ sid, adminStaffId: member.id, expire });

  res.cookie(ADMIN_STAFF_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
  });

  const { passwordHash: _ph, ...safeStaff } = member;
  return res.json({ adminStaff: safeStaff });
});

/* ── GET /admin-staff/me ─── */
router.get("/admin-staff/me", async (req, res) => {
  const sid = req.cookies?.[ADMIN_STAFF_COOKIE];
  if (!sid) return res.json({ adminStaff: null });

  const [session] = await db
    .select()
    .from(adminSessionsTable)
    .where(and(eq(adminSessionsTable.sid, sid), gt(adminSessionsTable.expire, new Date())));

  if (!session) {
    res.clearCookie(ADMIN_STAFF_COOKIE);
    return res.json({ adminStaff: null });
  }

  const [member] = await db
    .select()
    .from(adminStaffTable)
    .where(eq(adminStaffTable.id, session.adminStaffId));

  if (!member || !member.isActive) {
    res.clearCookie(ADMIN_STAFF_COOKIE);
    return res.json({ adminStaff: null });
  }

  const { passwordHash: _ph, ...safeStaff } = member;
  return res.json({ adminStaff: safeStaff });
});

/* ── POST /admin-staff/logout ─── */
router.post("/admin-staff/logout", async (req, res) => {
  const sid = req.cookies?.[ADMIN_STAFF_COOKIE];
  if (sid) {
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.sid, sid));
  }
  const localSid = getSessionId(req);
  const localSession = localSid ? await getSession(localSid) : null;
  // End the alternative OIDC admin session too, without logging out an unrelated owner.
  if (localSession && process.env.ADMIN_USER_ID && localSession.user.id === process.env.ADMIN_USER_ID) {
    await clearSession(res, localSid);
  }
  res.clearCookie(ADMIN_STAFF_COOKIE, { path: "/" });
  return res.json({ ok: true });
});

export default router;
