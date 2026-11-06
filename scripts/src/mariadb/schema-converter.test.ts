import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchema, identifier, seedLiteral, stringLiteral, translateExpression, type Column } from "./schema-converter";

const base: Column = {
  table_name: "examples", column_name: "value", data_type: "text", udt_name: "text",
  is_nullable: "YES", column_default: null, character_maximum_length: null,
  numeric_precision: null, numeric_scale: null, enum_values: null,
};
test("UTF-8 literals preserve Arabic, quotes, slash, newline and emoji as bytes", () => {
  const original = "تكيّة '\\\n🏠";
  const literal = stringLiteral(original);
  assert.equal(Buffer.from(literal.match(/X'([a-f0-9]+)'/)![1], "hex").toString("utf8"), original);
});
test("identifiers reject SQL injection and silent truncation", () => {
  assert.throws(() => identifier("x`; DROP TABLE admin_staff"));
  assert.throws(() => identifier("a".repeat(65)));
});
test("PostgreSQL checks keep enum membership and nullable-target exclusivity", () => {
  assert.equal(translateExpression("CHECK ((state = ANY (ARRAY['open'::text, 'closed'::text])))"),
    "CHECK ((state IN ('open', 'closed')))");
  assert.match(translateExpression("CHECK ((num_nonnulls(property_id, service_id) = 1))"),
    /\(property_id IS NOT NULL\) \+ \(service_id IS NOT NULL\)/);
});
test("unknown PostgreSQL checks and types fail instead of being discarded", () => {
  assert.throws(() => translateExpression("CHECK (value = ANY(values))"));
  assert.throws(() => buildSchema({ columns: [{ ...base, data_type: "inet" }], constraints: [], indexes: [] }));
});
test("arrays use JSON with array-type validation, not PostgreSQL braces", () => {
  const { sql } = buildSchema({ columns: [{
    ...base, data_type: "ARRAY", udt_name: "_text", column_default: "'{}'::text[]",
  }], constraints: [], indexes: [] });
  assert.match(sql, /JSON NULL DEFAULT '\[\]'/);
  assert.match(sql, /JSON_TYPE.*= 'ARRAY'/);
});
test("partial unique index only constrains rows matching its predicate", () => {
  const { sql } = buildSchema({
    columns: [{ ...base, column_name: "kind" }], constraints: [],
    indexes: [{
      table_name: "examples", index_name: "only_photography",
      is_unique: true, is_primary: false, method: "btree",
      predicate: "(kind = 'photography'::text)", expressions: ["kind"],
    }],
  });
  assert.match(sql, /CASE WHEN \(kind = 'photography'\) THEN `kind` ELSE NULL END/);
  assert.match(sql, /UNIQUE KEY `only_photography`/);
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ""), /DROP|TRUNCATE|IF NOT EXISTS/);
});
test("money remains exact decimal and timestamps require UTC", () => {
  assert.equal(seedLiteral("123456.78", { ...base, data_type: "numeric" }), "123456.78");
  assert.throws(() => seedLiteral("NaN", { ...base, data_type: "numeric" }));
  assert.throws(() => seedLiteral("2026-01-01T10:00:00+03:00", { ...base, data_type: "timestamp with time zone" }));
  assert.ok(seedLiteral("2026-01-01T10:00:00.123456+00:00", { ...base, data_type: "timestamp with time zone" }));
});
