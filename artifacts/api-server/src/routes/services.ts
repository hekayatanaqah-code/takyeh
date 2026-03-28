import { Router } from "express";
import { db } from "@workspace/db";
import { externalServicesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const { category } = req.query;
  const rows = await db
    .select()
    .from(externalServicesTable)
    .orderBy(externalServicesTable.createdAt);

  const active = rows.filter((r) => r.isActive);
  if (category && typeof category === "string") {
    return res.json(active.filter((r) => r.category === category));
  }
  return res.json(active);
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [service] = await db
    .select()
    .from(externalServicesTable)
    .where(eq(externalServicesTable.id, id));

  if (!service) return res.status(404).json({ error: "الخدمة غير موجودة" });
  return res.json(service);
});

export default router;
