import { verifyApplicationDatabase } from "@workspace/db";

/** Provisioning is an explicit SQL import, never an application-startup write. */
export async function seedCatalogIfEmpty() {
  await verifyApplicationDatabase();
}
