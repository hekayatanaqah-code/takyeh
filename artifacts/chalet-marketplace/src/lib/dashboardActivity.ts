export type DashboardActivity =
  | { type: "all" }
  | { type: "chalet"; id: number; submissionId?: number; name: string }
  | { type: "service"; id: number; name: string };

export function activityKey(activity: DashboardActivity) {
  return activity.type === "all" ? "all" : `${activity.type}-${activity.id}`;
}

export function financialManagementAllowed(
  access: { active?: boolean; scope?: "full" | "property"; freeAccess?: { active: boolean } | null } | null | undefined,
  privilegedStaff = false,
) {
  return privilegedStaff || !!access?.freeAccess?.active
    || (access?.active === true && access.scope === "full");
}

export function notificationInActivity(
  notification: { chaletId?: number | null; submissionId?: number | null; providerId?: number | null },
  activity: DashboardActivity,
) {
  if (activity.type === "all") return true;
  if (activity.type === "service") return notification.providerId === activity.id;
  return notification.chaletId === activity.id
    || (activity.submissionId != null && notification.submissionId === activity.submissionId);
}
