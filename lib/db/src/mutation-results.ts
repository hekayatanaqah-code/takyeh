import type { Column, GetColumnData, SQL } from "drizzle-orm";
export type Projection = Record<string, Column | SQL | SQL.Aliased>;
type FieldValue<F> = F extends Column ? GetColumnData<F> :
  F extends SQL<infer V> | SQL.Aliased<infer V> ? V : never;
export type Projected<P extends Projection> = { [K in keyof P]: FieldValue<P[K]> };
export type WriteResult<T> = { rows: T[]; rowCount: number };
