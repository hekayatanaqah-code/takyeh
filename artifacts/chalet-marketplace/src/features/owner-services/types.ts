import { Camera, Sparkles, Wrench, Shield, Home, Briefcase, type LucideIcon } from "lucide-react";
import { ORIGIN } from "../photography/shared";
import type { OwnerService as GenOwnerService } from "@workspace/api-client-react";
export type OwnerService = GenOwnerService;

export type ServiceIcon = "camera" | "sparkles" | "wrench" | "shield" | "home" | "briefcase";
export type ServiceKind = "photography" | "link";
export type ServiceState = "available" | "coming_soon" | "hidden";

export const ICONS: Record<ServiceIcon, LucideIcon> = { camera: Camera, sparkles: Sparkles, wrench: Wrench, shield: Shield, home: Home, briefcase: Briefcase };
export const ICON_AR: Record<ServiceIcon, string> = { camera: "كاميرا", sparkles: "لمسة", wrench: "صيانة", shield: "حماية", home: "منزل", briefcase: "أعمال" };
export const STATE_AR: Record<ServiceState, string> = { available: "متاحة للطلب", coming_soon: "قريباً", hidden: "مخفية/معطلة" };

/** Accepts https URLs or artifact-relative "/path" (not "//"). */
export function isSafeUrl(u: string | null | undefined): boolean {
  if (!u) return false;
  const s = u.trim();
  if (/[\\\s\x00-\x1f]/.test(s)) return false;
  if (s.startsWith("/") && !s.startsWith("//")) return true;
  try { const url = new URL(s); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}
export function resolveUrl(u: string): string {
  const s = u.trim();
  return s.startsWith("/") ? ORIGIN() + s : s;
}
export const isExternal = (u: string) => !u.trim().startsWith("/");
