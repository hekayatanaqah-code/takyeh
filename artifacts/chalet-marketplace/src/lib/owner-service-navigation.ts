export interface SelectableOwnerService {
  id: number;
  isActive: boolean;
}

export type PropertyListView = "approved" | "requests";

export function propertySubmissionsForView<T extends { status: string }>(
  submissions: readonly T[] = [],
  view: PropertyListView = "approved",
): T[] {
  return submissions.filter(submission => view === "approved"
    ? submission.status === "approved"
    : ["pending", "rejected", "needs_revision"].includes(submission.status));
}

/** Publication alone is insufficient: the current request must still be approved. */
export function hasApprovedActiveProperty(
  submissions: readonly { id: number; status: string }[] = [],
  properties: readonly { submissionId: number | null; isActive: boolean }[] = [],
): boolean {
  const approvedIds = new Set(submissions.filter(item => item.status === "approved").map(item => item.id));
  return properties.some(property =>
    property.isActive === true && property.submissionId !== null && approvedIds.has(property.submissionId),
  );
}

/** Pending/draft submissions also count as activities: keep their management accessible. */
export function hasOwnerActivities(
  propertyCount: number,
  propertySubmissionCount: number,
  serviceCount: number,
  serviceSubmissionCount: number,
): boolean {
  return [propertyCount, propertySubmissionCount, serviceCount, serviceSubmissionCount].some(count => count > 0);
}

/** Keep an explicit owned selection; otherwise prefer a live service. */
export function selectOwnerService(
  services: SelectableOwnerService[],
  selectedId: number | null,
): number | null {
  if (services.some(service => service.id === selectedId)) return selectedId;
  return (services.find(service => service.isActive) ?? services[0])?.id ?? null;
}

export function initialOwnerDashboardMode(
  businessType: "chalet" | "service" | "both" | null,
  serviceCount: number,
  serviceSubmissionCount: number,
  servicesFailed = false,
): "chalets" | "services" {
  if (businessType === "chalet" || !businessType) return "chalets";
  return businessType === "service" || serviceCount > 0 || serviceSubmissionCount > 0 || servicesFailed
    ? "services"
    : "chalets";
}