import { is, SQL, type SQLWrapper } from "drizzle-orm";

export type RawResultCodec = "json" | "boolean" | "integer" | "date";
const declarations = new WeakMap<SQL, Readonly<Record<string, RawResultCodec>>>();

/** Annotates result aliases, not SQL text. Bound user values are never inspected. */
export function withRawResultCodecs<T extends SQL>(query: T, codecs: Readonly<Record<string, RawResultCodec>>): T {
  for (const name of Object.keys(codecs)) {
    if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)) throw new Error("Invalid result alias.");
  }
  declarations.set(query, codecs);
  return query;
}
export function rawResultCodecs(query: SQLWrapper | string): Map<string, RawResultCodec> {
  const found = new Map<string, RawResultCodec>();
  const visited = new WeakSet<object>();
  function visit(value: unknown): void {
    if (is(value, SQL)) {
      if (visited.has(value)) return;
      visited.add(value);
      for (const [key, codec] of Object.entries(declarations.get(value) ?? {})) {
        if (found.has(key) && found.get(key) !== codec) throw new Error("Conflicting result codecs.");
        found.set(key, codec);
      }
      for (const child of value.queryChunks) visit(child);
    } else if (is(value, SQL.Aliased)) {
      visit(value.sql);
    } else if (Array.isArray(value)) {
      for (const child of value) visit(child);
    }
  }
  if (typeof query !== "string") visit(query.getSQL());
  return found;
}
