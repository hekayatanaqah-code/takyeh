export interface SelectableOwnerService {
  id: number;
  isActive: boolean;
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