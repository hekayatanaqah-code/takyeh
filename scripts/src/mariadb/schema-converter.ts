import { createHash } from "node:crypto";

export interface Column {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  enum_values: string[] | null;
}
export interface Constraint {
  table_name: string;
  constraint_name: string;
  kind: string;
  definition: string;
  columns: string[];
  foreign_table: string | null;
  foreign_columns: string[] | null;
  delete_action: string;
  update_action: string;
}
export interface Index {
  table_name: string;
  index_name: string;
  is_unique: boolean;
  is_primary: boolean;
  method: string;
  predicate: string | null;
  expressions: string[];
}
export interface Catalog {
  columns: Column[];
  constraints: Constraint[];
  indexes: Index[];
}

export function identifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value) || value.length > 64) {
    throw new Error(`Unsupported SQL identifier: ${value}`);
  }
  return `\`${value}\``;
}

// Hex literals avoid SQL-mode-dependent backslash escaping and retain UTF-8 bytes.
export function stringLiteral(value: string): string {
  return `CONVERT(X'${Buffer.from(value, "utf8").toString("hex")}' USING utf8mb4)`;
}

function quotedDefault(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function translateExpression(input: string): string {
  let expression = input
    .replace(/\b([a-z_][a-z0-9_]*)\s*=\s*ANY\s*\(ARRAY\[([\s\S]*?)\]\)/g,
      (_match, field: string, choices: string) => `${field} IN (${choices})`)
    .replace(/num_nonnulls\(([^)]+)\)/g, (_match, fields: string) =>
      `(${fields.split(",").map(field => `(${field.trim()} IS NOT NULL)`).join(" + ")})`)
    .replace(/::(?:character varying|timestamp with time zone|timestamp without time zone|[a-z_][a-z0-9_]*)(?:\[\])?/g, "")
    .replace(/\btrue\b/g, "1")
    .replace(/\bfalse\b/g, "0")
    .replace(/\blength\s*\(/gi, "CHAR_LENGTH(")
    .replaceAll('"', "`");
  // Deliberately refuse unmapped PostgreSQL constructs instead of weakening checks.
  if (/::|\bANY\b|\bARRAY\b|\bnum_nonnulls\b|;|--|\/\*/i.test(expression)) {
    throw new Error(`Untranslated PostgreSQL expression: ${input}`);
  }
  return expression;
}

export function columnType(column: Column, indexed: boolean): string {
  switch (column.data_type) {
    case "integer": return "INT";
    case "bigint": return "BIGINT";
    case "smallint": return "SMALLINT";
    case "boolean": return "TINYINT(1)";
    case "numeric":
      if (!column.numeric_precision || column.numeric_scale === null) {
        throw new Error(`Unbounded numeric needs review: ${column.table_name}.${column.column_name}`);
      }
      return `DECIMAL(${column.numeric_precision},${column.numeric_scale})`;
    case "double precision": return "DOUBLE";
    case "date": return "DATE";
    // PostgreSQL timestamptz is exported in UTC; no server-local conversions.
    case "timestamp with time zone":
    case "timestamp without time zone": return "DATETIME(6)";
    case "json":
    case "jsonb": return "JSON";
    case "ARRAY":
      if (column.udt_name !== "_text") throw new Error(`Unsupported array: ${column.udt_name}`);
      return "JSON";
    case "USER-DEFINED":
      if (!column.enum_values?.length) throw new Error(`Missing enum: ${column.udt_name}`);
      return `ENUM(${column.enum_values.map(quotedDefault).join(",")})`;
    case "character varying":
      return `VARCHAR(${column.character_maximum_length ?? 191})`;
    case "text": return indexed ? "VARCHAR(191)" : "LONGTEXT";
    default: throw new Error(`Unsupported PostgreSQL type: ${column.data_type}`);
  }
}

export function columnDefault(column: Column): string {
  const value = column.column_default;
  if (value === null || value.startsWith("nextval(")) return "";
  if (value === "now()") return " DEFAULT CURRENT_TIMESTAMP(6)";
  if (value === "gen_random_uuid()") return " DEFAULT (UUID())";
  if (value === "true" || value === "false") return ` DEFAULT ${value === "true" ? 1 : 0}`;
  const stripped = value.replace(/::(?:[a-z_][a-z0-9_]*|character varying)(?:\[\])?$/i, "");
  const quoted = /^'((?:[^']|'')*)'$/.exec(stripped);
  if (quoted) {
    let text = quoted[1].replaceAll("''", "'");
    if (column.data_type === "ARRAY") {
      if (text !== "{}") throw new Error("Nonempty array defaults require explicit conversion");
      text = "[]";
    }
    return ` DEFAULT ${quotedDefault(text)}`;
  }
  if (/^-?\d+(\.\d+)?$/.test(stripped)) return ` DEFAULT ${stripped}`;
  throw new Error(`Unsupported default: ${column.table_name}.${column.column_name}`);
}

export function buildSchema(catalog: Catalog): { sql: string; narrowedColumns: string[] } {
  const indexed = new Set<string>();
  for (const index of catalog.indexes) {
    if (index.method !== "btree") throw new Error(`Unsupported index: ${index.index_name}`);
    for (const expression of index.expressions) {
      const column = expression.replace(/"/g, "").replace(/\s+(ASC|DESC)(\s+NULLS\s+(FIRST|LAST))?$/i, "");
      identifier(column);
      indexed.add(`${index.table_name}.${column}`);
    }
  }
  for (const constraint of catalog.constraints.filter(item => item.kind === "f")) {
    constraint.columns.forEach(name => indexed.add(`${constraint.table_name}.${name}`));
    constraint.foreign_columns?.forEach(name => indexed.add(`${constraint.foreign_table}.${name}`));
  }
  const narrowedColumns = catalog.columns
    .filter(column => column.data_type === "text" && indexed.has(`${column.table_name}.${column.column_name}`))
    .map(column => `${column.table_name}.${column.column_name}`);
  const tableNames = [...new Set(catalog.columns.map(column => column.table_name))].sort();
  const statements = [
    "-- MariaDB 10.11; generated from a read-only PostgreSQL catalog snapshot.",
    "-- IMPORT INTO AN EMPTY DATABASE ONLY. No DROP/TRUNCATE or existing-data overwrite.",
    "-- UTC dates; utf8mb4_bin retains case-sensitive identifier uniqueness.",
    "-- This schema export does NOT convert the application's PostgreSQL queries.",
    "SET NAMES utf8mb4 COLLATE utf8mb4_bin;",
    "SET time_zone = '+00:00';",
    "SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,NO_BACKSLASH_ESCAPES';",
  ];
  for (const table of tableNames) {
    const fields: string[] = [];
    for (const column of catalog.columns.filter(column => column.table_name === table)) {
      const auto = column.column_default?.startsWith("nextval(");
      const type = columnType(column, indexed.has(`${table}.${column.column_name}`));
      fields.push(`  ${identifier(column.column_name)} ${type}${column.is_nullable === "NO" ? " NOT NULL" : " NULL"}${auto ? " AUTO_INCREMENT" : columnDefault(column)}`);
      if (column.data_type === "boolean") {
        fields.push(`  CHECK (${identifier(column.column_name)} IN (0,1))`);
      }
      if (column.data_type === "ARRAY") {
        fields.push(`  CHECK (JSON_TYPE(${identifier(column.column_name)}) = 'ARRAY')`);
      }
    }
    for (const constraint of catalog.constraints.filter(item => item.table_name === table && item.kind === "c")) {
      fields.push(`  CONSTRAINT ${identifier(constraint.constraint_name)} ${translateExpression(constraint.definition)}`);
    }
    for (const index of catalog.indexes.filter(item => item.table_name === table)) {
      let keys = index.expressions.map(expression => {
        const match = /^"?([a-z_][a-z0-9_]*)"?(?:\s+(ASC|DESC)(?:\s+NULLS\s+(FIRST|LAST))?)?$/.exec(expression);
        if (!match) throw new Error(`Unsupported index expression: ${expression}`);
        return `${identifier(match[1])}${match[2] ? ` ${match[2]}` : ""}`;
      });
      if (index.predicate && !/^\(?[a-z_][a-z0-9_]* IS NOT NULL\)?$/.test(index.predicate)) {
        if (!index.is_unique || keys.length !== 1) throw new Error("Unsupported partial index");
        const generated = `_partial_${createHash("sha256").update(index.index_name).digest("hex").slice(0, 16)}`;
        const columnName = index.expressions[0].replaceAll('"', "");
        const source = catalog.columns.find(column => column.table_name === table && column.column_name === columnName);
        if (!source) throw new Error(`Missing partial-index column: ${columnName}`);
        fields.push(`  ${identifier(generated)} ${columnType(source, true)} GENERATED ALWAYS AS (CASE WHEN ${translateExpression(index.predicate)} THEN ${identifier(columnName)} ELSE NULL END) STORED`);
        keys = [identifier(generated)];
      }
      fields.push(index.is_primary
        ? `  PRIMARY KEY (${keys.join(",")})`
        : `  ${index.is_unique ? "UNIQUE " : ""}KEY ${identifier(index.index_name)} (${keys.join(",")})`);
    }
    statements.push(`CREATE TABLE ${identifier(table)} (\n${fields.join(",\n")}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin ROW_FORMAT=DYNAMIC;`);
  }
  const actions: Record<string, string> = {
    a: "RESTRICT", r: "RESTRICT", c: "CASCADE", n: "SET NULL",
  };
  for (const constraint of catalog.constraints.filter(item => item.kind === "f")) {
    if (!constraint.foreign_table || !constraint.foreign_columns ||
        !actions[constraint.delete_action] || !actions[constraint.update_action]) {
      throw new Error(`Unsupported foreign key: ${constraint.constraint_name}`);
    }
    statements.push(`ALTER TABLE ${identifier(constraint.table_name)} ADD CONSTRAINT ${identifier(constraint.constraint_name)} FOREIGN KEY (${constraint.columns.map(identifier).join(",")}) REFERENCES ${identifier(constraint.foreign_table)} (${constraint.foreign_columns.map(identifier).join(",")}) ON DELETE ${actions[constraint.delete_action]} ON UPDATE ${actions[constraint.update_action]};`);
  }
  return { sql: statements.join("\n\n") + "\n", narrowedColumns };
}

export function seedLiteral(value: unknown, column: Column): string {
  if (value === null) return "NULL";
  if (column.data_type === "boolean") {
    if (typeof value !== "boolean") throw new Error("Invalid boolean seed");
    return value ? "1" : "0";
  }
  if (["integer", "bigint", "smallint", "numeric", "double precision"].includes(column.data_type)) {
    const text = String(value);
    if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text)) throw new Error("Invalid numeric seed");
    return text;
  }
  if (["jsonb", "json", "ARRAY"].includes(column.data_type)) return stringLiteral(JSON.stringify(value));
  if (column.data_type.startsWith("timestamp")) {
    const text = String(value);
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:\+00:00|Z)?$/.test(text)) {
      throw new Error(`Unsupported non-UTC timestamp in seed: ${column.table_name}.${column.column_name}`);
    }
    return stringLiteral(text.replace("T", " ").replace(/(?:\+00:00|Z)$/, ""));
  }
  return stringLiteral(String(value));
}
