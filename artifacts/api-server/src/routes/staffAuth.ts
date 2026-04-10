import { Router } from "express";
import { db } from "@workspace/db";
import {
  ownerStaffTable,
  staffSessionsTable,
  adminStaffTable,
  adminSessionsTable,
} from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const router = Router();

const STAFF_SESSION_COOKIE   = "staff_sid";
const ADMIN_STAFF_COOKIE     = "admin_staff_sid";
const SESSION_TTL_MS         = 7 * 24 * 60 * 60 * 1000;

const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge,
});

/* ════════════════════════════════════════════════
   POST /unified-login
   Checks owner_staff first, then admin_staff.
   Returns { role, redirect } on success.
   ════════════════════════════════════════════════ */
router.post("/unified-login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: "يرجى إدخال اسم المستخدم وكلمة المرور" });
  }
  const user = String(username).trim();

  /* ── 1. Check owner_staff ── */
  const [ownerStaff] = await db
    .select()
    .from(ownerStaffTable)
    .where(eq(ownerStaffTable.username, user));

  if (ownerStaff) {
    /* Account found but no password set → tell the user exactly what's wrong */
    if (!ownerStaff.passwordHash) {
      return res.status(401).json({
        error: "هذا الحساب لا يملك كلمة مرور — تواصل مع مديرك لإضافة بيانات الدخول من لوحة التحكم",
      });
    }
    if (!ownerStaff.isActive) {
      return res.status(403).json({ error: "هذا الحساب موقوف. تواصل مع صاحب العمل" });
    }
    const valid = await bcrypt.compare(String(password), ownerStaff.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "كلمة المرور غير صحيحة" });
    }
    const sid    = crypto.randomBytes(32).toString("hex");
    const expire = new Date(Date.now() + SESSION_TTL_MS);
    await db.insert(staffSessionsTable).values({ sid, staffId: ownerStaff.id, ownerId: ownerStaff.ownerId, expire });
    res.cookie(STAFF_SESSION_COOKIE, sid, cookieOpts(SESSION_TTL_MS));
    return res.json({ role: "staff", redirect: "/dashboard" });
  }

  /* ── 2. Cross-block: if this username belongs to admin_staff → deny, redirect to admin portal ── */
  const [adminStaff] = await db
    .select()
    .from(adminStaffTable)
    .where(eq(adminStaffTable.username, user));

  if (adminStaff) {
    return res.status(403).json({
      error: "يرجى استخدام بوابة الإدارة المخصصة",
      adminPortal: true,
    });
  }

  /* Username not found in either table */
  return res.status(401).json({ error: "لم يُعثر على حساب بهذا الاسم. تحقق من اسم المستخدم" });
});

/* ════════════════════════════════════════════════
   POST /admin-portal-login
   Private portal — admin_staff ONLY.
   Called from /admin/internal/access.
   ════════════════════════════════════════════════ */
router.post("/admin-portal-login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: "يرجى إدخال اسم المستخدم وكلمة المرور" });
  }
  const user = String(username).trim();

  const [adminStaff] = await db
    .select()
    .from(adminStaffTable)
    .where(eq(adminStaffTable.username, user));

  if (!adminStaff) {
    return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  }
  if (!adminStaff.passwordHash) {
    return res.status(401).json({ error: "هذا الحساب لا يملك كلمة مرور — تواصل مع المشرف العام" });
  }
  if (!adminStaff.isActive) {
    return res.status(403).json({ error: "هذا الحساب موقوف" });
  }
  const valid = await bcrypt.compare(String(password), adminStaff.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  }
  const sid    = crypto.randomBytes(32).toString("hex");
  const expire = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(adminSessionsTable).values({ sid, adminStaffId: adminStaff.id, expire });
  res.cookie(ADMIN_STAFF_COOKIE, sid, cookieOpts(SESSION_TTL_MS));
  return res.json({ role: "adminStaff", redirect: "/admin" });
});

/* ════════════════════════════════════════════════
   Legacy endpoints kept for backward compatibility
   ════════════════════════════════════════════════ */

/* ── POST /staff/login ─── */
router.post("/staff/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: "يرجى إدخال اسم المستخدم وكلمة المرور" });
  }

  const user = String(username).trim();

  /* Try owner_staff first */
  const [member] = await db
    .select()
    .from(ownerStaffTable)
    .where(eq(ownerStaffTable.username, user));

  if (!member || !member.passwordHash) {
    /* Fall back to admin_staff */
    const [adminStaff] = await db.select().from(adminStaffTable).where(eq(adminStaffTable.username, user));
    if (adminStaff?.passwordHash) {
      if (!adminStaff.isActive) return res.status(403).json({ error: "هذا الحساب موقوف" });
      const valid = await bcrypt.compare(String(password), adminStaff.passwordHash);
      if (!valid) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      const sid = crypto.randomBytes(32).toString("hex");
      const expire = new Date(Date.now() + SESSION_TTL_MS);
      await db.insert(adminSessionsTable).values({ sid, adminStaffId: adminStaff.id, expire });
      res.cookie(ADMIN_STAFF_COOKIE, sid, cookieOpts(SESSION_TTL_MS));
      return res.json({ role: "adminStaff", redirect: "/admin" });
    }
    return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  }
  if (!member.isActive) {
    return res.status(403).json({ error: "هذا الحساب موقوف. يرجى التواصل مع صاحب العمل" });
  }

  const valid = await bcrypt.compare(String(password), member.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  }

  const sid    = crypto.randomBytes(32).toString("hex");
  const expire = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(staffSessionsTable).values({ sid, staffId: member.id, ownerId: member.ownerId, expire });
  res.cookie(STAFF_SESSION_COOKIE, sid, cookieOpts(SESSION_TTL_MS));

  const { passwordHash: _ph, ...safeStaff } = member;
  return res.json({ staff: safeStaff, role: "staff", redirect: "/dashboard" });
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
