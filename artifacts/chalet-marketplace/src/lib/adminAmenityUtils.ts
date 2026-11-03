import { resolveAmenity, type AmenityInfo } from "./amenityUtils";

export interface AdminAmenityEntry {
  id?: number | string;
  key: string;
  labelAr: string;
}

/** Administrative displays must never use a stored identifier as a label. */
export function resolveAdminAmenity(raw: string, catalog?: AdminAmenityEntry[]): AmenityInfo {
  const key = raw.trim();
  const entry = catalog?.find(item => item.key === key || (item.id != null && String(item.id) === key));
  const info = resolveAmenity(entry?.key ?? key, catalog);
  const label = (entry ? entry.labelAr : info.ar).trim();
  const containsUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(label);
  return {
    ...info,
    ar: /[\u0621-\u064A]/.test(label) && !/[a-z]/i.test(label) && !containsUuid
      ? label
      : "مرفق غير معرّف",
  };
}
