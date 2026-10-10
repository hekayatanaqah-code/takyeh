import { Router } from "express";
import { db, ownerServicesTable } from "@workspace/db";
import { and, asc, isNull, ne } from "drizzle-orm";
import { requireAuth } from "./owner";
const router = Router();
router.get("/", requireAuth, async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const services = await db.select().from(ownerServicesTable)
    .where(and(isNull(ownerServicesTable.deletedAt), ne(ownerServicesTable.state, "hidden")))
    .orderBy(asc(ownerServicesTable.sortOrder), asc(ownerServicesTable.id));
  return res.json({ services });
});
export default router;
