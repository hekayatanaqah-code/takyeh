// Explicit opt-in for the user-requested pilot. Names may change during editing.
const SERVICE_DETAILS_PILOT_PROVIDER_ID = 282;

export function isServiceDetailsPilot(providerId: number | null | undefined): boolean {
  return providerId === SERVICE_DETAILS_PILOT_PROVIDER_ID;
}
