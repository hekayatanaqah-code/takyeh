import ts from "typescript";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Read-only source planner. Writes proposed diffs ONLY under /tmp. Source edits
// require separate review/application; unsupported chains fail rather than guess.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = "/tmp/takyeh-mutation-port";
await mkdir(output, { recursive: true });
const plans: { file: string; edits: number; patch: string }[] = [];
const unsupported: string[] = [];
async function scan(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) { await scan(absolute); continue; }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
    const text = await readFile(absolute, "utf8");
    const source = ts.createSourceFile(absolute, text, ts.ScriptTarget.Latest, true);
    const edits: { start: number; end: number; replacement: string }[] = [];
    const used = new Set<string>();
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        if (["returning", "onConflictDoNothing", "onConflictDoUpdate"].includes(method)) {
          // A conflict clause followed by returning belongs to that outer call.
          const parent = node.parent;
          if (ts.isPropertyAccessExpression(parent) && ts.isCallExpression(parent.parent) &&
              parent.name.text === "returning") return ts.forEachChild(node, visit);
          const calls = new Map<string, ts.CallExpression>();
          let base: ts.Expression = node;
          while (ts.isCallExpression(base) && ts.isPropertyAccessExpression(base.expression)) {
            calls.set(base.expression.name.text, base);
            base = base.expression.expression;
          }
          const kind = ["insert", "update", "delete"].find(name => calls.has(name));
          const expected = new Set(["insert", "update", "delete", "values", "set", "where", "returning", "onConflictDoNothing", "onConflictDoUpdate"]);
          if (!kind || [...calls.keys()].some(name => !expected.has(name))) {
            unsupported.push(`${absolute}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: unsupported mutation chain`);
            return;
          }
          const mutation = calls.get(kind)!;
          const table = mutation.arguments[0]?.getText(source);
          const values = calls.get(kind === "insert" ? "values" : "set")?.arguments[0]?.getText(source);
          const where = calls.get("where")?.arguments[0]?.getText(source) ?? "undefined";
          const returning = calls.get("returning");
          const projection = returning?.arguments[0]?.getText(source);
          const conflict = calls.get("onConflictDoUpdate") ?? calls.get("onConflictDoNothing");
          let helper: string;
          let args: string[];
          if (!table || (kind !== "delete" && !values)) throw new Error("Incomplete mutation.");
          if (kind === "insert") {
            helper = returning ? "insertRecords" : "writeRecords";
            args = [base.getText(source), table, values!];
            const options: string[] = [];
            if (conflict) {
              const action = calls.has("onConflictDoUpdate") ? "update" : "ignore";
              options.push(`conflict: { action: "${action}", ...${conflict.arguments[0]?.getText(source) ?? "{}"} }`);
            }
            if (projection) options.push(`returning: ${projection}`);
            if (options.length) args.push(`{ ${options.join(", ")} }`);
          } else {
            helper = kind === "update" ? "updateRecords" : "deleteRecords";
            args = [base.getText(source), table];
            if (kind === "update") args.push(values!);
            args.push(where);
            if (projection) args.push(projection);
          }
          used.add(helper);
          edits.push({ start: node.getStart(source), end: node.end, replacement: `${helper}(${args.join(", ")})` });
          return;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    if (!edits.length) continue;
    edits.sort((a, b) => b.start - a.start);
    for (let i = 1; i < edits.length; i++) {
      if (edits[i].end > edits[i - 1].start) throw new Error("Overlapping source mutation edits.");
    }
    let changed = text;
    for (const edit of edits) changed = changed.slice(0, edit.start) + edit.replacement + changed.slice(edit.end);
    changed = `import { ${[...used].sort().join(", ")} } from "@workspace/db/mutations";\n${changed}`;
    const file = path.relative(root, absolute);
    const proposed = path.join(output, file);
    await mkdir(path.dirname(proposed), { recursive: true });
    await writeFile(proposed, changed);
    const diff = spawnSync("diff", ["-U2", absolute, proposed], { encoding: "utf8" });
    if (diff.status !== 1) throw new Error(`Cannot prepare diff: ${file}`);
    const lines = diff.stdout.split("\n").slice(2).map(line => line.startsWith("@@") ? "@@" : line);
    const patch = `*** Begin Patch\n*** Update File: ${file}\n${lines.join("\n")}*** End Patch\n`;
    await writeFile(`${proposed}.patch`, patch);
    plans.push({ file, edits: edits.length, patch: `${proposed}.patch` });
  }
}
await scan(path.join(root, "artifacts/api-server/src"));
await writeFile(path.join(output, "manifest.json"), JSON.stringify({ plans, unsupported }, null, 2));
console.log(JSON.stringify({ changes: plans.reduce((sum, item) => sum + item.edits, 0), plans, unsupported }, null, 2));
