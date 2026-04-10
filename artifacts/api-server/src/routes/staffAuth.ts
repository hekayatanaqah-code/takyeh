import { Router } from "express";
import { db } from "@workspace/db";
import { ownerStaffTable, staffSessionsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const router = Router();

const STAFF_SESSION_COOKIE = "staff_sid";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/* ── POST /staff/login ─── */
router.post("/staff/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: "يرجى إدخال اسم المستخدم وكلمة المرور" });
  }

  const [member] = await db
    .select()
    .from(ownerStaffTable)
    .where(eq(ownerStaffTable.username, String(username).trim()));

  if (!member || !member.passwordHash) {
    return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  }
  if (!member.isActive) {
    return res.status(403).json({ error: "هذا الحساب موقوف. يرجى التواصل مع صاحب العمل" });
  }

  const valid = await bcrypt.compare(String(password), member.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  }

  const sid = crypto.randomBytes(32).toString("hex");
  const expire = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(staffSessionsTable).values({
    sid,
    staffId: member.id,
    ownerId: member.ownerId,
    expire,
  });

  res.cookie(STAFF_SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
  });

  const { passwordHash: _ph, ...safeStaff } = member;
  return res.json({ staff: safeStaff });
});

/* ── GET /staff/me ─── */
router.get("/staff/me", async (req, res) => {
  const sid = req.cookies?.[STAFF_SESSION_COOKIE];
  if (!sid) return res.json({ staff: null });

  const [row] = await db
    .select()
    .from(staffSessionsTable)
    .where(and(eq(staffSessionsTable.sid, sid), gt(staffSessionsTable.expire, new Date())));

  if (!row) {
    res.clearCookie(STAFF_SESSION_COOKIE);
    return res.json({ staff: null });
  }

  const [member] = await db
    .select()
    .from(ownerStaffTable)
    .where(eq(ownerStaffTable.id, row.staffId));

  if (!member || !member.isActive) {
    res.clearCookie(STAFF_SESSION_COOKIE);
    return res.json({ staff: null });
  }

  const { passwordHash: _ph, ...safeStaff } = member;
  return res.json({ staff: safeStaff });
});

/* ── POST /staff/logout ─── */
router.post("/staff/logout", async (req, res) => {
  const sid = req.cookies?.[STAFF_SESSION_COOKIE];
  if (sid) {
    await db.delete(staffSessionsTable).where(eq(staffSessionsTable.sid, sid));
  }
  res.clearCookie(STAFF_SESSION_COOKIE);
  return res.json({ ok: true });
});

export default router;
