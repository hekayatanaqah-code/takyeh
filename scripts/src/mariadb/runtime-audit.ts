import ts from "typescript";

export type Finding = { file: string; line: number; rule: string; severity: "blocker" | "review" };

/**
 * Structural source inventory, not a SQL translator or a substitute for native
 * integration tests. Findings contain locations only, never settings/row values.
 */
export function auditSource(file: string, text: string, nativeBindingsVerified = false): Finding[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const findings: Finding[] = [];
  const add = (node: ts.Node, rule: string, severity: Finding["severity"] = "blocker") => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    if (!findings.some(item => item.line === line && item.rule === rule)) {
      findings.push({ file, line, rule, severity });
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) &&
        (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent) ||
         (ts.isCallExpression(node.parent) && (node.parent.expression.kind === ts.SyntaxKind.ImportKeyword ||
           node.parent.expression.getText(source) === "require")))) {
      const name = node.text;
      if (/^(pg(?:\/|$)|drizzle-orm\/(?:node-postgres|pg-core))/.test(name)) add(node, "postgres-driver-or-schema");
      if (!nativeBindingsVerified && (name === "@workspace/db" || name === "@workspace/db/schema")) add(node, "legacy-database-import");
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text === "returning") add(node, "mutation-returning");
      if (/^onConflictDo/.test(node.expression.name.text)) add(node, "postgres-upsert");
    }
    if (!nativeBindingsVerified && ts.isPropertyAccessExpression(node) && node.name.text === "rows") {
      add(node, "postgres-result-shape", "review");
    }
    if (ts.isStringLiteral(node) && ["23505", "23503", "23514", "40001", "40P01"].includes(node.text)) {
      // This shared infrastructure intentionally recognizes duplicate technical
      // mutex inserts in both real driver protocols. It contains no PG query.
      // Application handlers must still select their native error classifier.
      if (!(nativeBindingsVerified && file==="lib/db/src/transaction-lock.ts" &&
        node.text==="23505" && text.includes("current.errno === 1062"))) add(node, "postgres-error-code");
    }
    // Scan SQL tagged literals as one statement, including interpolated parts.
    // Arbitrary interpolations remain unconverted and require native tests.
    if (ts.isTaggedTemplateExpression(node) && /(?:^|\.)sql$/.test(node.tag.getText(source))) {
      const template = node.template;
      const sql = ts.isNoSubstitutionTemplateLiteral(template) ? template.text :
        template.head.text + template.templateSpans.map(span => ` ? ${span.literal.text}`).join("");
      const rules: Array<[string, RegExp]> = [
        ["postgres-advisory-lock", /\b(?:pg_advisory\w*|hashtext(?:extended)?)\s*\(/i],
        ["postgres-cast", /::\s*(?:text|int\w*|numeric|decimal|jsonb?|date|timestamp\w*|boolean|bigint|float\w*)\b/i],
        ["postgres-array", /\b(?:ARRAY\s*\[|ANY\s*\(|UNNEST\s*\(|array_agg\s*\(|array_length\s*\()/i],
        ["postgres-json", /\bjsonb\w*\b|->>?|#>>?/i],
        ["postgres-case-insensitive-match", /\bILIKE\b/i],
        ["postgres-concatenation", /\|\|/],
        ["postgres-aggregate-filter", /\bFILTER\s*\(\s*WHERE\b/i],
        ["postgres-interval", /\bINTERVAL\s+'/i],
        ["postgres-null-ordering", /\bNULLS\s+(?:FIRST|LAST)\b/i],
        ["postgres-distinct-on", /\bDISTINCT\s+ON\s*\(/i],
        ["postgres-raw-upsert", /\bON\s+CONFLICT\b/i],
        ["postgres-raw-returning", /\bRETURNING\b/i],
        ["postgres-regex", /\bSIMILAR\s+TO\b|(?:!~\*?|~\*)|(?:^|\s)~(?:\s|$)/i],
        ["postgres-time-expression", /\b(?:TO_CHAR|DATE_TRUNC|MAKE_INTERVAL)\s*\(|\bEXTRACT\s*\(\s*EPOCH\b/i],
        ["postgres-query-construct", /\b(?:LATERAL|regexp_match|make_date|bool_or|string_agg)\b|\btranslate\s*\(|\bIS\s+(?:NOT\s+)?DISTINCT\s+FROM\b/i],
      ];
      for (const [rule, pattern] of rules) if (pattern.test(sql)) add(node, rule);
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        /127\.0\.0\.1:1106|REPLIT_SIDECAR/.test(node.text)) {
      add(node, "replit-storage-sidecar");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}
