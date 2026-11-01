import { GenericLabel } from "./generic";

type Choice = "bookings" | "profile";

// Valid TypeScript, intentionally incompatible with the current preview metadata
// transform. Never import this negative control into the application.
export function PreviewTransformRegression() {
  return <GenericLabel<Choice> value="bookings" />;
}
