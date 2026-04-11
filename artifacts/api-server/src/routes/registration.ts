import { Router } from "express";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router = Router();

/* ── POST /register-owner ───────────────────────────────────
   Public registration for new chalet owners.
   Stored as pending application; admin reviews + activates.
   ─────────────────────────────────────────────────────────── */
router.post("/register-owner", async (req, res) => {
  const { fullName, chaletName, phone, email, password } = req.body ?? {};

  if (!fullName || !chaletName || !phone || !email || !password) {
    return res.status(400).json({ error: "يرجى تعبئة جميع الحقول المطلوبة" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "كلمة المرور يجب أن تكون ٦ أحرف على الأقل" });
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
    sql`INSERT INTO owner_applications (full_name, chalet_name, phone, email, password_hash, status)
        VALUES (${String(fullName).trim()}, ${String(chaletName).trim()}, ${String(phone).trim()}, ${emailLower}, ${passwordHash}, 'pending')`
  );

  console.log(`[New Owner Application] Name: ${fullName}, Chalet: ${chaletName}, Email: ${emailLower}`);

  return res.status(201).json({ ok: true, message: "تم استلام طلبك بنجاح" });
});

export default router;
