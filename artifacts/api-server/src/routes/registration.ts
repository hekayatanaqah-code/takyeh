import { Router } from "express";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router = Router();

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  chalet:  "مالك شاليه",
  service: "مزود خدمة",
  both:    "مالك شاليه + مزود خدمة",
};

/* ── POST /register-owner ───────────────────────────────────
   Public registration for new partners (chalet owners / service providers).
   Stored as pending application; admin reviews + activates.
   ─────────────────────────────────────────────────────────── */
router.post("/register-owner", async (req, res) => {
  const { fullName, businessName, businessType = "chalet", phone, email, password } = req.body ?? {};

  if (!fullName || !businessName || !phone || !email || !password) {
    return res.status(400).json({ error: "يرجى تعبئة جميع الحقول المطلوبة" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "كلمة المرور يجب أن تكون ٦ أحرف على الأقل" });
  }
  if (!["chalet", "service", "both"].includes(businessType)) {
    return res.status(400).json({ error: "نوع النشاط غير صحيح" });
  }

  const emailLower = String(email).trim().toLowerCase();

  /* Check for duplicate email */
  const [existing] = await db.execute<{ id: number }>(
    sql`SELECT id FROM owner_applications WHERE email = ${emailLower} LIMIT 1`
  );
  if (existing) {
    return res.status(409).json({ error: "هذا البريد الإلكتروني مسجّل مسبقاً. تواصل مع الإدارة إذا لم يتم التفعيل" });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);

  await db.execute(
    sql`INSERT INTO owner_applications (full_name, business_name, business_type, phone, email, password_hash, status)
        VALUES (
          ${String(fullName).trim()},
          ${String(businessName).trim()},
          ${String(businessType)},
          ${String(phone).trim()},
          ${emailLower},
          ${passwordHash},
          'pending'
        )`
  );

  console.log(
    `[New Partner Application] Name: ${fullName}, Business: ${businessName}, ` +
    `Type: ${BUSINESS_TYPE_LABELS[businessType] ?? businessType}, Email: ${emailLower}`
  );

  return res.status(201).json({ ok: true, message: "تم استلام طلبك بنجاح" });
});

/* ── GET /admin/applications ────────────────────────────────
   Returns all pending partner applications (admin only).
   ─────────────────────────────────────────────────────────── */
router.get("/admin/applications", async (_req, res) => {
  const rows = await db.execute<{
    id: number; full_name: string; business_name: string; business_type: string;
    phone: string; email: string; status: string; created_at: string;
  }>(
    sql`SELECT id, full_name, business_name, business_type, phone, email, status, created_at
        FROM owner_applications ORDER BY created_at DESC`
  );
  return res.json(rows);
});

/* ── PATCH /admin/applications/:id ─────────────────────────
   Update application status: approved | rejected
   ─────────────────────────────────────────────────────────── */
router.patch("/admin/applications/:id", async (req, res) => {
  const { status } = req.body ?? {};
  if (!["approved", "rejected", "pending"].includes(status)) {
    return res.status(400).json({ error: "الحالة غير صحيحة" });
  }
  await db.execute(
    sql`UPDATE owner_applications SET status = ${String(status)} WHERE id = ${Number(req.params.id)}`
  );
  return res.json({ ok: true });
});

export default router;
