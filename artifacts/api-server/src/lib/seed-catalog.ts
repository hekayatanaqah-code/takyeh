import { db } from "@workspace/db";
import { citiesCatalogTable, amenitiesCatalogTable } from "@workspace/db/schema";

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

export async function seedCatalogIfEmpty() {
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
}
