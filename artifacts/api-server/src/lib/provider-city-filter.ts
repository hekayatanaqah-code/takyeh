import { randomInt } from "node:crypto";

/**
 * Coverage matching does not depend on PostgreSQL arrays/UNNEST or on MariaDB's
 * JSON_TABLE syntax. Both drivers decode the model into the same string[].
 * Keep exact, case-insensitive matching: a city is not a substring.
 */
export function providerCoversCity(
  provider: { city: string | null; coverageTags: readonly string[] | null },
  city: string | undefined,
  allKingdomCoverage: string,
): boolean {
  if (!city || city === "all") return true;
  const requested = city.toLowerCase();
  return provider.city?.toLowerCase() === requested || Boolean(provider.coverageTags?.some(value =>
    value.toLowerCase() === requested || value.toLowerCase() === allKingdomCoverage.toLowerCase(),
  ));
}

/** Database-independent Fisher–Yates ordering for public inventory results. */
export function shuffledInventory<T>(items: readonly T[]): T[] {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [output[index], output[other]] = [output[other], output[index]];
  }
  return output;
}
