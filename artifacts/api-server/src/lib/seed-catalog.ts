import { db } from "@workspace/db";
import { citiesCatalogTable, regionsCatalogTable, amenitiesCatalogTable, siteSettingsTable } from "@workspace/db/schema";
import { isNull, sql } from "drizzle-orm";

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

  /* ── Cancellation Policy columns on chalet_submissions ── */
  await db.execute(sql`ALTER TABLE chalet_submissions ADD COLUMN IF NOT EXISTS cancellation_window_enabled BOOLEAN NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE chalet_submissions ADD COLUMN IF NOT EXISTS cancellation_window_hours INTEGER DEFAULT 24`);
  await db.execute(sql`ALTER TABLE chalet_submissions ADD COLUMN IF NOT EXISTS booking_policy_text TEXT`);

  /* ── Chalet logo column ── */
  await db.execute(sql`ALTER TABLE chalet_submissions ADD COLUMN IF NOT EXISTS logo_url TEXT`);

  /* ── Owner Refunds table ── */
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS owner_refunds (
      id SERIAL PRIMARY KEY,
      owner_id TEXT NOT NULL,
      booking_id INTEGER REFERENCES owner_bookings(id) ON DELETE CASCADE,
      amount NUMERIC(10,2) NOT NULL,
      type TEXT NOT NULL DEFAULT 'partial',
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ── Back-fill: mark insurance as refunded for all pre-existing cancelled bookings ──
     Safe/idempotent: only touches rows where cancelled_at IS NOT NULL and
     insurance_fee > 0 and insurance_refunded is still false.                        ── */
  await db.execute(sql`
    UPDATE owner_bookings
    SET insurance_refunded = true
    WHERE cancelled_at IS NOT NULL
      AND insurance_fee IS NOT NULL
      AND CAST(insurance_fee AS NUMERIC) > 0
      AND (insurance_refunded IS NULL OR insurance_refunded = false)
  `);

  /* ── Contact Inquiries table ── */
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contact_inquiries (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ── Force-upgrade outdated message templates that are missing financial variables ──
     Runs every startup but only touches rows that lack {الإيجار} in the template.
     Safe/idempotent: skips rows that already contain the variable.               ── */
  const NEW_CONFIRMATION_TEMPLATE =
    "مرحباً {اسم_العميل}، تم تأكيد حجزك في {اسم_العقار} بتاريخ {التاريخ}. نسعد باستقبالك.\n\nقيمة الإيجار: {الإيجار} ريال.\nمبلغ التأمين: {التأمين} ريال.\nالمبلغ المدفوع: {المدفوع} ريال.\nالمتبقي: {المتبقي} ريال.";

  const NEW_MODIFICATION_TEMPLATE =
    "مرحباً {اسم_العميل}، تم تعديل حجزك في {اسم_العقار} بناءً على ({سبب_التعديل}).\n\nالحجز السابق: يوم {اسم_اليوم_من} ({من_التاريخ} | {من_التاريخ_م}) - فترة {الفترة_القديمة}.\n\nالحجز الجديد: يوم {اسم_اليوم_إلى} ({إلى_التاريخ} | {إلى_التاريخ_م}) - فترة {الفترة_الجديدة}.\n\nقيمة الإيجار: {الإيجار} ريال.\nمبلغ التأمين: {التأمين} ريال.\nالمبلغ المدفوع: {المدفوع} ريال.\nالمتبقي: {المتبقي} ريال.";

  await db.execute(sql`
    UPDATE owner_notification_settings
    SET booking_confirmation_template = ${NEW_CONFIRMATION_TEMPLATE}
    WHERE booking_confirmation_template IS NULL
       OR booking_confirmation_template NOT LIKE '%{الإيجار}%'
  `);

  await db.execute(sql`
    UPDATE owner_notification_settings
    SET change_notice_template = ${NEW_MODIFICATION_TEMPLATE}
    WHERE change_notice_template IS NULL
       OR change_notice_template NOT LIKE '%{الإيجار}%'
  `);

  await db.execute(sql`
    UPDATE owner_notification_settings
    SET booking_confirmation_template = REPLACE(
          booking_confirmation_template,
          'المتبقي للدفع عند الوصول:',
          'المتبقي:'
        ),
        change_notice_template = REPLACE(
          change_notice_template,
          'المتبقي للدفع عند الوصول:',
          'المتبقي:'
        )
    WHERE booking_confirmation_template LIKE '%المتبقي للدفع عند الوصول:%'
       OR change_notice_template LIKE '%المتبقي للدفع عند الوصول:%'
  `);

  const NEW_CANCELLATION_TEMPLATE =
    "مرحباً {اسم_العميل}، نود إشعارك بإلغاء حجزك في {اسم_العقار} بتاريخ {التاريخ}.\n\nالسبب: {سبب_الإلغاء}.\n\nتفاصيل المبالغ المُستردّة:\n• استرداد العربون: {استرداد_العربون} ريال\n• استرداد التأمين: {استرداد_التأمين} ريال\n• إجمالي المبلغ المسترد: {إجمالي_المسترد} ريال";

  await db.execute(sql`
    UPDATE owner_notification_settings
    SET arrival_reminder_template = ${NEW_CANCELLATION_TEMPLATE}
    WHERE arrival_reminder_template IS NULL
       OR arrival_reminder_template NOT LIKE '%{استرداد_العربون}%'
  `);

  const [qassimRegion] = await db
    .insert(regionsCatalogTable)
    .values({ name: "منطقة القصيم" })
    .onConflictDoUpdate({ target: regionsCatalogTable.name, set: { name: "منطقة القصيم" } })
    .returning();

  const existingCities = await db.select().from(citiesCatalogTable);
  if (existingCities.length === 0) {
    await db.insert(citiesCatalogTable).values(
      INITIAL_CITIES.map((name) => ({ name, regionId: qassimRegion.id }))
    );
  } else {
    await db.update(citiesCatalogTable)
      .set({ regionId: qassimRegion.id })
      .where(isNull(citiesCatalogTable.regionId));
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
