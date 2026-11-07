import { createHash } from "node:crypto";
import { columnDefault, columnType, translateExpression, type Catalog, type Column } from "./schema-converter";

const camel = (text: string) => text.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
const variable = (table: string) => `${camel(table)}Table`;
const raw = (text: string) => `sql.raw(${JSON.stringify(text)})`;

function nativeColumn(column: Column, indexed: boolean): string {
  const name = JSON.stringify(column.column_name);
  const type = columnType(column, indexed);
  let code: string;
  if (type.startsWith("VARCHAR(")) code = `m.varchar(${name}, { length: ${type.match(/\d+/)![0]} })`;
  else if (type.startsWith("DECIMAL(")) code = `m.decimal(${name}, { precision: ${column.numeric_precision}, scale: ${column.numeric_scale} })`;
  else if (type.startsWith("ENUM(")) code = `m.mysqlEnum(${name}, ${JSON.stringify(column.enum_values)})`;
  else {
    const methods: Record<string, string> = {
      INT: "int", BIGINT: "bigint", SMALLINT: "smallint", DOUBLE: "double",
      "TINYINT(1)": "boolean", DATE: "date", "DATETIME(6)": "datetime",
      JSON: "json", LONGTEXT: "longtext",
    };
    const method = methods[type];
    if (!method) throw new Error(`Unsupported native Drizzle type: ${type}`);
    const options = type === "DATETIME(6)" ? ", { mode: \"date\", fsp: 6 }"
      : type === "DATE" ? ", { mode: \"string\" }"
      : type === "BIGINT" ? ", { mode: \"bigint\" }" : "";
    code = `m.${method}(${name}${options})`;
  }
  if (column.data_type === "ARRAY") code += ".$type<string[]>()";
  if (column.is_nullable === "NO") code += ".notNull()";
  if (column.column_default?.startsWith("nextval(")) code += ".autoincrement()";
  else {
    const defaultSql = columnDefault(column).replace(/^ DEFAULT /, "");
    if (defaultSql) code += `.default(${raw(defaultSql)})`;
  }
  return code;
}

/** Produces native mysql-core definitions, never a dialect-translation facade. */
export function generateDrizzleSchemas(catalog: Catalog): Map<string, string> {
  const files = new Map<string, string>();
  const tables = [...new Set(catalog.columns.map(column => column.table_name))].sort();
  const indexed = new Set<string>();
  for (const index of catalog.indexes) {
    index.expressions.forEach(expression => indexed.add(`${index.table_name}.${expression.replace(/"/g, "").split(" ")[0]}`));
  }
  for (const foreignKey of catalog.constraints.filter(item => item.kind === "f")) {
    foreignKey.columns.forEach(column => indexed.add(`${foreignKey.table_name}.${column}`));
    foreignKey.foreign_columns?.forEach(column => indexed.add(`${foreignKey.foreign_table}.${column}`));
  }
  for (const table of tables) {
    const imports = [
      "// Generated native MariaDB schema; not wired into the PostgreSQL API.",
      'import * as m from "drizzle-orm/mysql-core";',
      'import { sql, desc } from "drizzle-orm";',
    ];
    const foreignKeys = catalog.constraints.filter(item => item.table_name === table && item.kind === "f");
    const referenced = [...new Set(foreignKeys.map(item => item.foreign_table).filter(name => name && name !== table))];
    referenced.forEach(name => imports.push(`import { ${variable(name!)} } from "./${name}";`));
    const fields: string[] = [];
    const extra: string[] = [];
    for (const column of catalog.columns.filter(item => item.table_name === table)) {
      fields.push(`  ${camel(column.column_name)}: ${nativeColumn(column, indexed.has(`${table}.${column.column_name}`))},`);
      if (column.data_type === "boolean") {
        extra.push(`m.check(${JSON.stringify(`${table}_${column.column_name}_bool`.slice(0, 64))}, ${raw(`\`${column.column_name}\` IN (0,1)`)})`);
      } else if (column.data_type === "ARRAY") {
        extra.push(`m.check(${JSON.stringify(`${table}_${column.column_name}_array`.slice(0, 64))}, ${raw(`JSON_TYPE(\`${column.column_name}\`) = 'ARRAY'`)})`);
      }
    }
    // Explicit, additive application migration; see 001-application-contract.sql.
    // The legacy catalog lacks this nullable model field.
    if (table === "external_services" && !catalog.columns.some(column =>
      column.table_name === table && column.column_name === "owner_id")) {
      fields.push('  ownerId: m.varchar("owner_id", { length: 191 }),');
    }
    for (const check of catalog.constraints.filter(item => item.table_name === table && item.kind === "c")) {
      extra.push(`m.check(${JSON.stringify(check.constraint_name)}, ${raw(translateExpression(check.definition).replace(/^CHECK\s*/i, ""))})`);
    }
    for (const index of catalog.indexes.filter(item => item.table_name === table)) {
      let keys = index.expressions.map(expression => {
        const field = `table.${camel(expression.replaceAll('"', "").split(" ")[0])}`;
        return /\sDESC$/.test(expression) ? `desc(${field})` : field;
      });
      if (index.predicate && !/^\(?[a-z_][a-z0-9_]* IS NOT NULL\)?$/.test(index.predicate)) {
        const generated = `_partial_${createHash("sha256").update(index.index_name).digest("hex").slice(0, 16)}`;
        const columnName = index.expressions[0].replaceAll('"', "");
        const source = catalog.columns.find(column => column.table_name === table && column.column_name === columnName)!;
        const derived: Column = { ...source, column_name: generated, column_default: null, is_nullable: "YES" };
        fields.push(`  ${camel(generated)}: ${nativeColumn(derived, true)}.generatedAlwaysAs(${raw(`CASE WHEN ${translateExpression(index.predicate)} THEN \`${columnName}\` ELSE NULL END`)}, { mode: "stored" }),`);
        keys = [`table.${camel(generated)}`];
      }
      if (index.is_primary) extra.push(`m.primaryKey({ columns: [${keys.join(", ")}] })`);
      else extra.push(`m.${index.is_unique ? "uniqueIndex" : "index"}(${JSON.stringify(index.index_name)}).on(${keys.join(", ")})`);
    }
    const actions: Record<string, string> = { a: "restrict", r: "restrict", c: "cascade", n: "set null" };
    for (const foreignKey of foreignKeys) {
      const target = foreignKey.foreign_table === table ? "table" : variable(foreignKey.foreign_table!);
      extra.push(`m.foreignKey({ name: ${JSON.stringify(foreignKey.constraint_name)}, columns: [${foreignKey.columns.map(column => `table.${camel(column)}`).join(", ")}], foreignColumns: [${foreignKey.foreign_columns!.map(column => `${target}.${camel(column)}`).join(", ")}] }).onDelete(${JSON.stringify(actions[foreignKey.delete_action])}).onUpdate(${JSON.stringify(actions[foreignKey.update_action])})`);
    }
    files.set(`${table}.ts`, `${imports.join("\n")}\n\nexport const ${variable(table)} = m.mysqlTable(${JSON.stringify(table)}, {\n${fields.join("\n")}\n}, (table): m.MySqlTableExtraConfigValue[] => [\n${extra.map(line => `  ${line},`).join("\n")}\n]);\n`);
  }
  files.set("index.ts", tables.map(table => `export * from "./${table}";`).join("\n") + "\n");
  return files;
}
