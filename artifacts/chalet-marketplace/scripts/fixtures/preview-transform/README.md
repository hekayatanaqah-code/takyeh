# Live preview transform regression check

From the workspace root, with the existing `artifacts/chalet-marketplace: web`
workflow running:

```sh
pnpm --filter @workspace/chalet-marketplace run check:preview-transform
```

The check defaults to `https://$REPLIT_DEV_DOMAIN/`. Outside Replit, or for an
artifact mounted at another path, point it at the **already running** development
server, including the base path:

```sh
PREVIEW_BASE_URL=http://localhost:22125/ pnpm --filter @workspace/chalet-marketplace run check:preview-transform
```

No server is created and no login, feature flag, payment, or API write is involved.
This is an HTTP transform check, not a browser journey or a production build.
It verifies Vite's client, both photography entry modules, their generic widget
module, and isolated generic/specialized components. It requires JavaScript,
parses the returned code without executing it, and requires injected preview
metadata. Missing workflows, redirects, HTML fallbacks, missing preview plugins,
and broken application transforms fail with a nonzero exit status.

`explicit-generic.tsx` is valid TypeScript intentionally passed through the real
preview transform as a **negative control**. The current metadata injection
corrupts its explicit JSX type argument, producing an expected HTTP 500 and parser
diagnostic. Only that fixture is allowed to fail; it is never imported by the app.
The development-only `preview-transform-fixture-plugin.ts` intercepts that exact
fixture URL and calls the existing server's `transformRequest`. It returns the
real parser diagnostic as HTTP 500 without passing it to Vite's global error
middleware, which would otherwise broadcast or buffer a red HMR overlay for
unrelated visitors. No transform is mocked and normal application errors are
unchanged. If a future plugin version fixes the bug, this check will fail
explicitly so the negative control can be reviewed, rather than silently losing
its detection proof.

The detector itself has fast offline checks:

```sh
pnpm --filter @workspace/chalet-marketplace run test:preview-transform
```

This also typechecks all three isolated fixtures, including the negative control,
to prove the reproduction is valid TypeScript even though preview rejects it.
It does not typecheck or regenerate the API client.

Typechecking alone does not cover this development-only transform. Fixtures are
outside `src` and are not application entry points or part of production output.
