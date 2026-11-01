import { GenericLabel } from "./generic";

type Choice = "bookings" | "profile";
const ChoiceLabel = GenericLabel<Choice>;

// The supported workaround: specialize outside JSX.
export function PreviewTransformFixture() {
  return <ChoiceLabel value="bookings" />;
}
