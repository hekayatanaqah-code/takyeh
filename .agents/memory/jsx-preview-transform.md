---
name: JSX preview transform compatibility
description: Generic JSX syntax can pass TypeScript but break Replit's injected JSX metadata
---
Avoid explicit JSX type arguments on generic components in this app's preview; use prop inference or specialize the component outside JSX.

**Why:** The development metadata transform inserts attributes between the component name and its type arguments. Valid TypeScript such as a generic component tag then becomes invalid JSX before Babel parses it. A successful typecheck does not detect this development-only failure.

**How to apply:** Keep generic component definitions where useful, but omit type arguments at their JSX call sites. If inference is insufficient, create a typed component alias outside JSX. When preview and typecheck disagree, check the transformed-module response or Vite parser logs before changing application types.

Vite's server-side module transformation also injects preview metadata attributes into rendered markup.

**Why:** Server-rendered widget checks exercise the same metadata transform; their HTML is not identical to a plain React rendering without Vite.

**How to apply:** Compare rendered text or semantic attributes rather than exact raw HTML, and ignore injected metadata attributes in rendering assertions.

Temporary standalone fixtures that import app components must use the same versioned Vite dependency URLs as those components, particularly for React Query providers.

**Why:** Importing an unversioned provider alongside a versioned application hook created distinct context instances; the fixture crashed even though the application and types were valid.

**How to apply:** Inspect a transformed component's imports for the current dependency URLs instead of hardcoding a version or using an unversioned optimized-module URL.
