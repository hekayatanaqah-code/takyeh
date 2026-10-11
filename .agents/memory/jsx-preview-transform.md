---
name: JSX preview transform compatibility
description: Generic JSX syntax can pass TypeScript but break Replit's injected JSX metadata
---
Avoid explicit JSX type arguments on generic components in this app's preview; use prop inference or specialize the component outside JSX.

**Why:** The development metadata transform inserts attributes between the component name and its type arguments. Valid TypeScript such as a generic component tag then becomes invalid JSX before Babel parses it. A successful typecheck does not detect this development-only failure.

**How to apply:** Keep generic component definitions where useful, but omit type arguments at their JSX call sites. If inference is insufficient, create a typed component alias outside JSX. When preview and typecheck disagree, check the transformed-module response or Vite parser logs before changing application types.
