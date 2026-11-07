import ts from "typescript";

type TableModel = {
  variable: string;
  table: string;
  module: string;
  columns: Map<string, {
    property: string; type?: string; references: Set<string>; onUpdate?: string;
    array: boolean; nullable: boolean; defaulted: boolean;
  }>;
};

/**
 * Build application-facing models from the already reviewed native tables.
 * The legacy declarations supply TypeScript/validation contracts ONLY; neither
 * pg-core nor their SQL/table constructors occur in the generated output.
 * Missing tables/columns fail generation instead of widening to `any`.
 */
export function applicationContracts(
  sources: Map<string, string>,
  native: Map<string, string>,
): Map<string, string> {
  const tables: TableModel[] = [];
  const types = new Map<string, string>();
  const parsed = new Map<string, ts.SourceFile>();
  for (const [module, text] of sources) {
    const source = ts.createSourceFile(module, text, ts.ScriptTarget.Latest, true);
    parsed.set(module, source);
    for (const statement of source.statements) {
      if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
        types.set(statement.name.text, module);
      }
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        const call = declaration.initializer;
        if (!call || !ts.isCallExpression(call) || call.expression.getText(source) !== "pgTable") continue;
        const name = call.arguments[0];
        const object = call.arguments[1];
        if (!name || !ts.isStringLiteral(name) || !object || !ts.isObjectLiteralExpression(object)) {
          throw new Error(`Unsupported table declaration in ${module}`);
        }
        const model: TableModel = {
          variable: declaration.name.getText(source), table: name.text, module, columns: new Map(),
        };
        for (const property of object.properties) {
          if (!ts.isPropertyAssignment(property)) throw new Error(`Unsupported column in ${name.text}`);
          let column: string | undefined;
          let type: string | undefined;
          let onUpdate: string | undefined;
          let array = false;
          let nullable = true;
          let defaulted = false;
          const references = new Set<string>();
          const visit = (node: ts.Node) => {
            if (ts.isCallExpression(node)) {
              if (ts.isIdentifier(node.expression) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
                // All column constructors, including enum factories, receive
                // their persistent SQL column name as their first argument.
                column = node.arguments[0].text;
              }
              if (ts.isPropertyAccessExpression(node.expression)) {
                if (node.expression.name.text === "array") array = true;
                if (node.expression.name.text === "notNull" || node.expression.name.text === "primaryKey") nullable = false;
                if (node.expression.name.text === "default" || node.expression.name.text === "defaultNow") defaulted = true;
                if (node.expression.name.text === "$type" && node.typeArguments?.[0]) {
                  type = node.typeArguments[0].getText(source);
                  const collect = (part: ts.Node) => {
                    if (ts.isTypeReferenceNode(part) && ts.isIdentifier(part.typeName)) references.add(part.typeName.text);
                    ts.forEachChild(part, collect);
                  };
                  collect(node.typeArguments[0]);
                }
                if (node.expression.name.text === "$onUpdate" && node.arguments[0]) {
                  onUpdate = node.arguments[0].getText(source);
                }
              }
            }
            ts.forEachChild(node, visit);
          };
          visit(property.initializer);
          if (!column) throw new Error(`Column identity missing in ${name.text}`);
          model.columns.set(column, {
            property: property.name.getText(source), type, references, onUpdate, array, nullable, defaulted,
          });
        }
        tables.push(model);
      }
    }
  }

  const output = new Map<string, string>();
  const missing: string[] = [];
  for (const table of tables) {
    const definition = native.get(`${table.table}.ts`);
    if (!definition) { missing.push(table.table); continue; }
    for (const column of table.columns.keys()) {
      if (!definition.includes(`("${column}"`)) missing.push(`${table.table}.${column}`);
    }
  }
  if (missing.length) throw new Error(`Source/model drift: ${missing.join(", ")}`);
  const renames = new Map<string, Map<string, string>>();
  const camel = (value: string) => value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  for (const table of tables) {
    const names = new Map<string, string>();
    for (const [column, entry] of table.columns) names.set(camel(column), entry.property);
    renames.set(table.variable, names);
  }
  for (const [file, input] of native) {
    if (file === "index.ts") continue;
    const table = tables.find(model => `${model.table}.ts` === file);
    let content = input.replace("not wired into the PostgreSQL API", "native application model");
    const imports = new Map<string, Set<string>>();
    if (table) {
      for (const [column, entry] of table.columns) {
        const nativeProperty = camel(column);
        const lines = content.split("\n");
        const index = lines.findIndex(line => new RegExp(`^  ${nativeProperty}: `).test(line));
        if (index < 0) throw new Error(`Source/model drift: ${table.table}.${column}`);
        let line = lines[index].replace(`  ${nativeProperty}:`, `  ${entry.property}:`);
        if (entry.type) {
          // Insert before notNull/default/index modifiers; $type is a compile-
          // time contract, never a driver coercion or financial rounding step.
          line = line.replace(/(m\.(?:json|longtext|varchar)\("[^"]+"(?:, \{ length: \d+ \})?\))/, `$1.$type<${entry.type}>()`);
          if (!line.includes(".$type<")) throw new Error(`Unsupported typed column ${table.table}.${column}`);
          for (const name of entry.references) {
            const module = types.get(name);
            if (module) {
              const set = imports.get(module) ?? new Set<string>();
              set.add(name);
              imports.set(module, set);
            } else if (!["Array", "Record", "Partial", "Pick", "Omit"].includes(name)) {
              throw new Error(`Unknown application type ${name}`);
            }
          }
        }
        if (entry.onUpdate) line = line.replace(/,$/, `.$onUpdate(${entry.onUpdate}),`);
        lines[index] = line;
        content = lines.join("\n");
      }
    }
    // Preserve property aliases in indexes and references, not just columns.
    for (const [variable, names] of renames) {
      for (const [from, to] of names) {
        if (from === to) continue;
        content = content.replaceAll(`${variable}.${from}`, `${variable}.${to}`);
        if (table?.variable === variable) content = content.replaceAll(`table.${from}`, `table.${to}`);
      }
    }
    const typedImports = [...imports].map(([module, names]) =>
      `import type { ${[...names].join(", ")} } from "../${module.replace(/\.ts$/, "")}";`).join("\n");
    output.set(`tables/${file}`, `${typedImports}\n${content}`);
  }
  const tableVariables = new Set(tables.map(table => table.variable));
  for (const [module, source] of parsed) {
    const chunks = ["// Generated native application contracts. No PostgreSQL constructors."];
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) &&
          statement.moduleSpecifier.text === "drizzle-orm/pg-core") continue;
      if (ts.isVariableStatement(statement)) {
        const declaration = statement.declarationList.declarations[0];
        if (declaration && tableVariables.has(declaration.name.getText(source))) {
          const table = tables.find(item => item.variable === declaration.name.getText(source))!;
          const nativeVariable = `${camel(table.table)}Table`;
          const binding = nativeVariable === table.variable ? nativeVariable : `${nativeVariable} as ${table.variable}`;
          chunks.push(`import { ${binding} } from "./tables/${table.table}";\nexport { ${table.variable} };`);
          continue;
        }
        const initializer = declaration?.initializer;
        if (initializer && ts.isCallExpression(initializer) && initializer.expression.getText(source) === "pgEnum") {
          const values = initializer.arguments[1];
          if (!values || !ts.isArrayLiteralExpression(values)) throw new Error("Unsupported enum model");
          chunks.push(`export const ${declaration.name.getText(source)} = { enumValues: ${values.getText(source)} } as const;`);
          continue;
        }
      }
      let statementText = statement.getText(source);
      // MySQL models arrays as JSON. Preserve the old string[] INPUT contract
      // as well as its database CHECK; do not silently weaken validation to
      // "any JSON". Drizzle's explicit refinements own null/default handling.
      for (const table of tables.filter(model => model.module === module)) {
        const refinements = [...table.columns.values()].filter(column => column.array).map(column =>
          `${column.property}: z.array(z.string())${column.nullable ? ".nullable()" : ""}${column.defaulted || column.nullable ? ".optional()" : ""}`);
        if (refinements.length) {
          statementText = statementText.replaceAll(`createInsertSchema(${table.variable})`,
            `createInsertSchema(${table.variable}, { ${refinements.join(", ")} })`);
        }
      }
      chunks.push(statementText);
    }
    const needsZod = chunks.some(chunk => chunk.includes("z.array(z.string())"));
    const importsZod = source.statements.some(statement =>
      ts.isImportDeclaration(statement) && statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some(element => element.name.text === "z"));
    if (needsZod && !importsZod) chunks.unshift('import { z } from "zod/v4";');
    output.set(module, chunks.join("\n\n") + "\n");
  }
  return output;
}
