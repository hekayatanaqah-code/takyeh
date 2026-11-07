import { test } from "node:test";
import assert from "node:assert/strict";
import { applicationContracts } from "./application-contracts";

const source = new Map([
  ["index.ts", 'export * from "./model";'],
  ["model.ts", `import { pgTable, jsonb, serial, timestamp } from "drizzle-orm/pg-core";
export type Item = { name: string; quantity: number };
export const salesTable = pgTable("sales", {
  id: serial("id").primaryKey(),
  renamedItems: jsonb("line_items").$type<Item[]>().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});
export type Sale = typeof salesTable.$inferSelect;`],
]);
const native = new Map([
  ["sales.ts", `import * as m from "drizzle-orm/mysql-core";
export const salesTable = m.mysqlTable("sales", {
  id: m.int("id").notNull().autoincrement(),
  lineItems: m.json("line_items").notNull(),
  updatedAt: m.datetime("updated_at", { mode: "date", fsp: 6 }),
}, table => [m.index("items_idx").on(table.lineItems)]);`],
  ["index.ts", 'export * from "./sales";'],
]);

test("preserves JSON contract, aliased model properties and update timestamps without pg-core", () => {
  const output = applicationContracts(source, native);
  const model = output.get("model.ts")!;
  const table = output.get("tables/sales.ts")!;
  assert.doesNotMatch(model, /pg-core|pgTable\(/);
  assert.match(model, /export type Sale/);
  assert.match(table, /\$type<Item\[\]>\(\)/);
  assert.match(table, /renamedItems: m\.json/);
  assert.match(table, /table\.renamedItems/);
  assert.match(table, /\$onUpdate\(\(\) => new Date\(\)\)/);
  assert.match(table, /import type \{ Item \}/);
});
test("source/catalog drift fails instead of silently dropping a model field", () => {
  const drifted = new Map(native);
  drifted.set("sales.ts", native.get("sales.ts")!.replace('"line_items"', '"different_column"'));
  assert.throws(() => applicationContracts(source, drifted), /Source\/model drift.*line_items/);
});
test("unknown custom types fail rather than becoming any", () => {
  const unsupported = new Map(source);
  unsupported.set("model.ts", source.get("model.ts")!.replace("$type<Item[]>()", "$type<MissingDomainType[]>()"));
  assert.throws(() => applicationContracts(unsupported, native), /Unknown application type/);
});
test("JSON transport never weakens text-array input validation", () => {
  const input = new Map(source);
  input.set("model.ts", source.get("model.ts")!.replace(
    'renamedItems: jsonb("line_items").$type<Item[]>().notNull(),',
    'renamedItems: text("line_items").array().notNull().default([]),',
  ) + "\nexport const insertSaleSchema = createInsertSchema(salesTable);");
  const result = applicationContracts(input, native).get("model.ts")!;
  assert.match(result, /renamedItems: z\.array\(z\.string\(\)\)\.optional\(\)/);
});
