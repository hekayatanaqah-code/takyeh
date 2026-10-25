---
name: Generated API export boundaries
description: Resolving schema/model alias collisions without dropping runtime validators
---
When generation emits model aliases with the same names as runtime Zod schemas, resolve the barrel ambiguity with explicit value exports for the schemas, not type-only exports.

**Why:** Type-only re-exports cleared the library build but hid validators required as runtime values by the API server. A passing shared-library build did not establish consumer correctness.

**How to apply:** Keep disambiguation outside regenerated output, preserve runtime schema exports, and typecheck consuming packages after regeneration.

After regeneration, rebuild shared TypeScript declarations before interpreting consumer “missing export” errors.

**Why:** Project-reference consumers can resolve stale declarations even when the generated source and barrel already export the new schema correctly.

**How to apply:** Refresh the shared-library build before changing a correctly exported schema to work around a leaf-package diagnostic.
