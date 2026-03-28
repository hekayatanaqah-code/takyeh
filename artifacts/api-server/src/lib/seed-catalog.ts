import { db } from "@workspace/db";
import { citiesCatalogTable, amenitiesCatalogTable } from "@workspace/db/schema";

const INITIAL_CITIES = [
  "بريدة", "عنيزة", "الرس", "الخبراء",
  "البكيرية", "عيون الجواء", "المذنب", "الأسياح",
];

const INITIAL_AMENITIES = [
  { key: "indoor_pool", labelAr: "مسبح داخلي" },
  { key: "outdoor_pool", labelAr: "مسبح خارجي" },
  { key: "kids_games", labelAr: "ألعاب أطفال" },
  { key: "water_games", labelAr: "ألعاب مائية" },
  { key: "large_garden", labelAr: "حديقة كبيرة" },
  { key: "bedrooms", labelAr: "غرف نوم" },
  { key: "bbq", labelAr: "ركن شواء" },
  { key: "private_majlis", labelAr: "مجالس مستقلة" },
];

export async function seedCatalogIfEmpty() {
  const existingCities = await db.select().from(citiesCatalogTable);
  if (existingCities.length === 0) {
    await db.insert(citiesCatalogTable).values(
      INITIAL_CITIES.map((name) => ({ name }))
    );
  }

  const existingAmenities = await db.select().from(amenitiesCatalogTable);
  if (existingAmenities.length === 0) {
    await db.insert(amenitiesCatalogTable).values(INITIAL_AMENITIES);
  }
}
