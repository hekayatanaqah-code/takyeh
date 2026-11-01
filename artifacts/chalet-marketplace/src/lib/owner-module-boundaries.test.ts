import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const src = new URL("../", import.meta.url);
const dashboard = new URL("pages/Dashboard.tsx", src);
const ownerPath = "/components/owner/";
const files = new Map<string, ts.SourceFile>();

function readModule(url: URL): ts.SourceFile {
  let source = files.get(url.href);
  if (!source) {
    source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    files.set(url.href, source);
  }
  return source;
}

function ownerDependencies(source: ts.SourceFile): URL[] {
  return source.statements.filter(ts.isImportDeclaration).flatMap(statement => {
    const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
    return specifier.startsWith("@/components/owner/")
      ? [new URL(`${specifier.slice(2)}.tsx`, src)]
      : [];
  });
}

function collect(url: URL, stack: string[] = []): void {
  assert.ok(!stack.includes(url.href), `Owner module cycle: ${[...stack, url.href].join(" -> ")}`);
  if (files.has(url.href)) return;
  const source = readModule(url);
  for (const next of ownerDependencies(source)) collect(next, [...stack, url.href]);
}

collect(dashboard);

test("dashboard composition and its owner modules stay below Babel's large-file threshold", () => {
  assert.ok(readModule(dashboard).text.length < 150_000, "Keep section bodies outside Dashboard");
  for (const [name, source] of files) {
    assert.ok(Buffer.byteLength(source.text, "utf8") < 500_000, `${name} exceeds 500 KB`);
  }
});

test("owner sections have an acyclic dependency graph and never reach into the route's state", () => {
  for (const [name, source] of files) {
    if (!name.includes(ownerPath)) continue;
    for (const statement of source.statements.filter(ts.isImportDeclaration)) {
      const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
      assert.ok(!specifier.includes("pages/Dashboard"), `${name} imports its composition root`);
    }
  }
});

test("rendered components have stable module identities rather than nested React definitions", () => {
  for (const [name, source] of files) {
    const nestedComponents = new Set<string>();
    const jsxComponents = new Set<string>();
    function visit(node: ts.Node, functionDepth = 0): void {
      if (functionDepth > 0 && ts.isFunctionDeclaration(node) && node.name && /^[A-Z]/.test(node.name.text)) {
        nestedComponents.add(node.name.text);
      }
      if (functionDepth > 0 && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
        && /^[A-Z]/.test(node.name.text) && node.initializer
        && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
        nestedComponents.add(node.name.text);
      }
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName)) {
        jsxComponents.add(node.tagName.text);
      }
      ts.forEachChild(node, child => visit(child, functionDepth + (ts.isFunctionLike(node) ? 1 : 0)));
    }
    visit(source);
    assert.deepEqual([...nestedComponents].filter(component => jsxComponents.has(component)), [], name);
  }
});

test("preview, service and financial contexts have one owner and stay provided by the route", () => {
  const contexts = readModule(new URL("components/owner/OwnerDashboardContexts.tsx", src)).text;
  const composition = readModule(dashboard).text;
  for (const context of ["ImpersonationCtx", "ServiceErpCtx", "AdminFinanceCtx"]) {
    assert.ok(contexts.includes(`export const ${context} = createContext`));
    assert.ok(composition.includes(`<${context}.Provider`));
    const definitions = [...files.values()].filter(source =>
      new RegExp(`(?:const|let) ${context}\\s*=`).test(source.text));
    assert.equal(definitions.length, 1, `${context} must not split into independent instances`);
  }
  assert.ok(!composition.includes("createContext("));
});
