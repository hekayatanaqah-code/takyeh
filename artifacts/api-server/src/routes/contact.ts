import { Router } from "express";
import { db } from "@workspace/db";
import { adminAuditLogsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAdminOrAdminStaff, requireSupportDisputesAdmin } from "./admin";

const router = Router();

/* ── POST /api/contact — public inquiry form ────────────────── */
router.post("/", async (req, res) => {
  try {
    const { name, phone, email, message } = req.body as Record<string, string>;
    if (!name?.trim()) return res.status(400).json({ error: "الاسم مطلوب" });
    if (!message?.trim()) return res.status(400).json({ error: "نص الرسالة مطلوب" });
    if (!phone?.trim() && !email?.trim()) {
      return res.status(400).json({ error: "يرجى إدخال رقم الجوال أو البريد الإلكتروني" });
    }

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
router.get("/admin/inquiries", requireAdminOrAdminStaff, requireSupportDisputesAdmin, async (req, res) => {
  try {
    const result = await db.execute(
      sql`SELECT id, name, phone, email, message,
                 CASE LOWER(status)
                   WHEN 'read' THEN 'in_progress'
                   WHEN 'replied' THEN 'answered'
                   ELSE LOWER(status)
                 END AS status,
                 admin_notes, created_at, updated_at
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
router.patch("/admin/inquiries/:id/status", requireAdminOrAdminStaff, requireSupportDisputesAdmin, async (req, res) => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { status, adminNotes } = req.body as { status: string; adminNotes?: string | null };
    if (!["new", "in_progress", "answered", "read", "replied"].includes(status)) {
      return res.status(400).json({ error: "حالة غير صالحة" });
    }
    const normalizedStatus = status === "read" ? "in_progress" : status === "replied" ? "answered" : status;
    const [audit] = await db.insert(adminAuditLogsTable).values({
      actorId: req.adminStaff?.id != null ? String(req.adminStaff.id) : req.user?.id ?? null,
      actorName: req.adminStaff?.name ?? (req.user as { name?: string } | undefined)?.name ?? "مجهول",
      action: "patch_contact_inquiry",
      method: "PATCH",
      path: `/api/contact/admin/inquiries/${encodeURIComponent(id)}/status`,
      entity: "contact-inquiries",
      entityId: id,
      metadata: { source: "contact-admin-route", status: "started" },
    }).returning({ id: adminAuditLogsTable.id });
    await db.execute(
      sql`UPDATE contact_inquiries
          SET status = ${normalizedStatus},
              admin_notes = COALESCE(${adminNotes === undefined ? null : adminNotes}, admin_notes),
              updated_at = NOW()
          WHERE id = ${parseInt(id, 10)}`
    );
    await db.update(adminAuditLogsTable)
      .set({ metadata: { source: "contact-admin-route", status: "completed", statusCode: 200 } })
      .where(eq(adminAuditLogsTable.id, audit.id));
    return res.json({ ok: true, status: normalizedStatus });
  } catch (err) {
    console.error("[PATCH /admin/contact-inquiries/:id/status]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

export default router;
