import { Router } from "express";
import { db } from "@workspace/db";
import { citiesCatalogTable, amenitiesCatalogTable, districtsCatalogTable, chaletCategoriesTable, serviceCategoriesTable, expenseCategoriesTable, siteSettingsTable } from "@workspace/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.get("/cities", async (_req, res) => {
  const rows = await db
    .select()
    .from(citiesCatalogTable)
    .orderBy(citiesCatalogTable.name);
  return res.json(rows.filter((r) => r.isActive));
});

router.get("/districts", async (req, res) => {
  const cityId = req.query.cityId ? Number(req.query.cityId) : null;
  let rows = await db
    .select()
    .from(districtsCatalogTable)
    .orderBy(districtsCatalogTable.name);
  rows = rows.filter((r) => r.isActive);
  if (cityId) {
    rows = rows.filter((r) => r.cityId === cityId);
  }
  return res.json(rows);
});

/* ── Public write: auto-save cities typed by users ── */
router.post("/cities", async (req, res) => {
  const body = z.object({ name: z.string().min(1).trim() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "الاسم مطلوب" });
  const name = body.data.name.trim();
  const existing = await db.select().from(citiesCatalogTable)
    .where(sql`LOWER(${citiesCatalogTable.name}) = LOWER(${name})`);
  if (existing.length > 0) return res.json(existing[0]);
  const [city] = await db.insert(citiesCatalogTable).values({ name }).returning();
  return res.status(201).json(city);
});

/* ── Public write: auto-save districts typed by users ── */
router.post("/districts", async (req, res) => {
  const body = z.object({ name: z.string().min(1).trim(), cityId: z.number().int().positive() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  const { name, cityId } = body.data;
  const existing = await db.select().from(districtsCatalogTable)
    .where(and(sql`LOWER(${districtsCatalogTable.name}) = LOWER(${name})`, eq(districtsCatalogTable.cityId, cityId)));
  if (existing.length > 0) return res.json(existing[0]);
  const [district] = await db.insert(districtsCatalogTable).values({ name, cityId }).returning();
  return res.status(201).json(district);
});

router.get("/amenities", async (_req, res) => {
  const rows = await db
    .select()
    .from(amenitiesCatalogTable)
    .orderBy(amenitiesCatalogTable.createdAt);
  return res.json(rows.filter((r) => r.isActive));
});

router.get("/categories", async (_req, res) => {
  const rows = await db
    .select()
    .from(chaletCategoriesTable)
    .orderBy(chaletCategoriesTable.createdAt);
  return res.json(rows.filter((r) => r.isActive));
});

router.get("/service-categories", async (_req, res) => {
  const rows = await db
    .select()
    .from(serviceCategoriesTable)
    .orderBy(serviceCategoriesTable.sortOrder, serviceCategoriesTable.createdAt);
  return res.json(rows.filter((r) => r.isActive));
});

router.get("/expense-categories", async (_req, res) => {
  const rows = await db
    .select()
    .from(expenseCategoriesTable)
    .orderBy(expenseCategoriesTable.sortOrder, expenseCategoriesTable.createdAt);
  return res.json(rows);
});

/* ── Public page content + contact settings ── */
router.get("/page-content", async (_req, res) => {
  const PUBLIC_KEYS = [
    "about_page_content",
    "faq_page_content",
    "terms_page_content",
    "platform_whatsapp",
    "whatsapp_message",
    "platform_email",
    "instagram_url",
    "twitter_url",
    "site_title",
    "site_logo_url",
    "primary_color",
    "hero_title",
    "hero_subtitle",
    "hero_bg_url",
    "feature_1",
    "feature_2",
    "feature_3",
    "snapchat_url",
    "snapchat_show",
    "tiktok_url",
    "tiktok_show",
    "instagram_show",
    "twitter_show",
    "feat_card1_title",
    "feat_card1_text",
    "feat_card1_icon",
    "feat_card2_title",
    "feat_card2_text",
    "feat_card2_icon",
    "feat_card3_title",
    "feat_card3_text",
    "feat_card3_icon",
    "footer_title",
    "footer_desc",
    "copyright_text",
    "wa_message_template",
    "wa_review_template",
    "svc_btn_enabled",
    "svc_btn_label",
    "svc_btn_color",
  ];
  const rows = await db
    .select()
    .from(siteSettingsTable)
    .where(inArray(siteSettingsTable.key, PUBLIC_KEYS));
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return res.json(map);
});

export default router;
