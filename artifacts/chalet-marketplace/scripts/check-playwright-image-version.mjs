import { readFile } from "node:fs/promises";

const packageJsonPath = new URL("../package.json", import.meta.url);
const workflowPath = new URL(
  "../../../.github/workflows/iphone-calendar-release-gate.yml",
  import.meta.url,
);

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const workflow = await readFile(workflowPath, "utf8");

const packageVersion = packageJson.devDependencies?.["@playwright/test"];
const imageMatch = workflow.match(
  /mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-[a-z0-9.-]+/i,
);
const imageVersion = imageMatch?.[1];
const exactVersionPattern = /^\d+\.\d+\.\d+$/;

if (!packageVersion || !imageVersion) {
  console.error(
    [
      "Playwright version check failed: could not read both required versions.",
      `@playwright/test: ${packageVersion ?? "missing"}`,
      `Playwright image: ${imageVersion ?? "missing"}`,
      "Fix: set an exact @playwright/test version in artifacts/chalet-marketplace/package.json",
      "and use the same version in mcr.microsoft.com/playwright:v<version>-noble",
      "inside .github/workflows/iphone-calendar-release-gate.yml.",
    ].join("\n"),
  );
  process.exit(1);
}

if (!exactVersionPattern.test(packageVersion) || packageVersion !== imageVersion) {
  console.error(
    [
      "Playwright version mismatch detected.",
      `@playwright/test package version: ${packageVersion}`,
      `Playwright container image version: ${imageVersion}`,
      "Fix: pin @playwright/test to an exact version (without ^ or ~) and set",
      "mcr.microsoft.com/playwright:v<same-version>-noble in",
      ".github/workflows/iphone-calendar-release-gate.yml, then update pnpm-lock.yaml.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  `Playwright versions match: @playwright/test ${packageVersion} and container image v${imageVersion}.`,
);