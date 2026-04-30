import { db } from "@workspace/db";
import { citiesCatalogTable, amenitiesCatalogTable, siteSettingsTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

const INITIAL_CITIES = [
  "بريدة", "عنيزة", "الرس", "الخبراء",
  "البكيرية", "عيون الجواء", "المذنب", "الأسياح",
];

const INITIAL_AMENITIES = [
  { key: "indoor_pool",    labelAr: "مسبح داخلي" },
  { key: "outdoor_pool",   labelAr: "مسبح خارجي" },
  { key: "kids_games",     labelAr: "ألعاب أطفال" },
  { key: "water_games",    labelAr: "ألعاب مائية" },
  { key: "large_garden",   labelAr: "حديقة كبيرة" },
  { key: "bbq",            labelAr: "ركن شواء" },
  { key: "private_majlis", labelAr: "مجالس مستقلة" },
  { key: "football_court", labelAr: "ملعب كرة قدم" },
  { key: "basketball_court", labelAr: "ملعب كرة سلة" },
  { key: "billiard",       labelAr: "بلياردو" },
  { key: "table_tennis",   labelAr: "تنس طاولة" },
  { key: "playground",     labelAr: "ملعب أطفال" },
  { key: "gym",            labelAr: "صالة رياضية" },
  { key: "cinema_room",    labelAr: "غرفة سينما" },
  { key: "wifi",           labelAr: "واي فاي" },
  { key: "ac",             labelAr: "تكييف مركزي" },
  { key: "kitchen",        labelAr: "مطبخ مجهز" },
];

const INITIAL_SITE_SETTINGS = [
  { key: "site_display_name", value: "تكية" },
  { key: "hero_line1", value: "تكية" },
  { key: "hero_line2", value: "بوابتك المتكاملة لأجمل الوجهات والخدمات" },
  { key: "hero_word_color", value: "#F59E0B" },
  { key: "feat_section_title", value: "لماذا تختار تكية؟" },
  { key: "feat_section_desc", value: "نحن نسهل عليك العثور على المكان المثالي لمناسباتك العائلية والخاصة" },
  { key: "privacy_page_content", value: "نحترم خصوصيتك ونلتزم بحماية بياناتك. تُستخدم المعلومات التي تقدمها لتحسين تجربتك والتواصل معك بشأن الحجوزات والاستفسارات فقط." },
];

export async function seedCatalogIfEmpty() {
  /* Safe column migrations — idempotent, ignored if column already exists */
  await db.execute(sql`
    ALTER TABLE owner_applications
    ADD COLUMN IF NOT EXISTS whatsapp_subscribed_at TIMESTAMPTZ
  `);
  await db.execute(sql`ALTER TABLE owner_bookings ADD COLUMN IF NOT EXISTS cancel_reason_code TEXT`);
  await db.execute(sql`ALTER TABLE owner_bookings ADD COLUMN IF NOT EXISTS cancel_refund_amount NUMERIC(10,2)`);
  await db.execute(sql`ALTER TABLE owner_bookings ADD COLUMN IF NOT EXISTS cancel_income NUMERIC(10,2)`);

  const existingCities = await db.select().from(citiesCatalogTable);
  if (existingCities.length === 0) {
    await db.insert(citiesCatalogTable).values(
      INITIAL_CITIES.map((name) => ({ name }))
    );
  }

  for (const amenity of INITIAL_AMENITIES) {
    await db
      .insert(amenitiesCatalogTable)
      .values(amenity)
      .onConflictDoNothing({ target: amenitiesCatalogTable.key });
  }

  for (const setting of INITIAL_SITE_SETTINGS) {
    await db
      .insert(siteSettingsTable)
      .values(setting)
      .onConflictDoNothing({ target: siteSettingsTable.key });
  }
}
