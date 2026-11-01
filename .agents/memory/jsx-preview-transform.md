---
name: JSX preview transform compatibility
description: Generic JSX syntax can pass TypeScript but break Replit's injected JSX metadata
---
Avoid explicit JSX type arguments on generic components in this app's preview; use prop inference or specialize the component outside JSX.

**Why:** The development metadata transform inserts attributes between the component name and its type arguments. Valid TypeScript such as a generic component tag then becomes invalid JSX before Babel parses it. A successful typecheck does not detect this development-only failure.

**How to apply:** Keep generic component definitions where useful, but omit type arguments at their JSX call sites. If inference is insufficient, create a typed component alias outside JSX. When preview and typecheck disagree, check the transformed-module response or Vite parser logs before changing application types.

The generic-JSX limitation is a preview-plugin compatibility constraint, not an application type error. A future plugin upgrade may remove it.

**Why:** Guarding only against failures can give false confidence when the development metadata plugin is missing entirely.

**How to apply:** For live transform checks, require evidence that preview metadata injection is active as well as valid JavaScript. Keep the known-bad example isolated from application routes; if a plugin upgrade accepts it, review the compatibility assumption instead of silently skipping the negative control.

Expected transform failures must not pass through Vite's normal HTTP error middleware on a shared preview server.

**Why:** That middleware broadcasts errors to connected HMR clients and buffers errors for the next visitor even when the failed module is not imported by the app. An isolated fixture can therefore still cover the homepage with an error overlay.

**How to apply:** Catch deliberate negative-control errors around the existing server's real transform call, returning their diagnostics to the check without broadcasting them. Leave normal application error handling untouched.

Vite's server-side module transformation also injects preview metadata attributes into rendered markup.

**Why:** Server-rendered widget checks exercise the same metadata transform; their HTML is not identical to a plain React rendering without Vite.

**How to apply:** Compare rendered text or semantic attributes rather than exact raw HTML, and ignore injected metadata attributes in rendering assertions.

Temporary standalone fixtures that import app components must use the same versioned Vite dependency URLs as those components, particularly for React Query providers.

**Why:** Importing an unversioned provider alongside a versioned application hook created distinct context instances; the fixture crashed even though the application and types were valid.

**How to apply:** Inspect a transformed component's imports for the current dependency URLs instead of hardcoding a version or using an unversioned optimized-module URL.
