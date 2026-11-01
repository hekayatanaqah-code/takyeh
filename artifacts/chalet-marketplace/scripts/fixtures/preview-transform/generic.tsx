// Isolated from application routes: no authentication, requests, or side effects.
export function GenericLabel<T extends string>({ value }: { value: T }) {
  return <span>{value}</span>;
}
