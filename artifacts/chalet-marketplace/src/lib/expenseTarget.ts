import type { DashboardActivity } from "./dashboardActivity";

/** A lone activity is displayed by name even while the dashboard scope remains "all". */
export function defaultExpenseActivity(
  unit: DashboardActivity,
  activities: DashboardActivity[],
): DashboardActivity {
  return unit.type === "all" && activities.length === 1 ? activities[0] : unit;
}

export function expenseTarget(activity: DashboardActivity) {
  if (activity.type === "service") return { providerId: activity.id };
  if (activity.type === "chalet") {
    if (!activity.submissionId) throw new Error("تعذر تحديد العقار المرتبط بالمصروف. أعد تحميل الصفحة.");
    return { submissionId: activity.submissionId };
  }
  return {};
}
