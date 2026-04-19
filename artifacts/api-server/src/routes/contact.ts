import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

/* ── POST /api/contact — public inquiry form ────────────────── */
router.post("/", async (req, res) => {
  try {
    const { name, phone, email, message } = req.body as Record<string, string>;
    if (!name?.trim()) return res.status(400).json({ error: "الاسم مطلوب" });
    if (!message?.trim()) return res.status(400).json({ error: "نص الرسالة مطلوب" });

    await db.execute(
      sql`INSERT INTO contact_inquiries (name, phone, email, message, status, created_at)
          VALUES (${name.trim()}, ${(phone ?? "").trim() || null}, ${(email ?? "").trim() || null},
                  ${message.trim()}, 'new', now())`
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[POST /contact]", err);
    return res.status(500).json({ error: "حدث خطأ أثناء إرسال الرسالة" });
  }
});

/* ── GET /admin/contact-inquiries — admin: list all inquiries ── */
router.get("/admin/inquiries", async (req, res) => {
  try {
    const result = await db.execute(
      sql`SELECT id, name, phone, email, message, status, created_at
          FROM contact_inquiries
          ORDER BY created_at DESC
          LIMIT 200`
    );
    return res.json((result as any).rows);
  } catch (err) {
    console.error("[GET /admin/contact-inquiries]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

/* ── PATCH /admin/contact-inquiries/:id/status — mark read/replied ── */
router.patch("/admin/inquiries/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status: string };
    if (!["new", "read", "replied"].includes(status)) {
      return res.status(400).json({ error: "حالة غير صالحة" });
    }
    await db.execute(
      sql`UPDATE contact_inquiries SET status = ${status} WHERE id = ${parseInt(id, 10)}`
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /admin/contact-inquiries/:id/status]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

export default router;
