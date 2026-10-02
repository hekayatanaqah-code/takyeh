---
name: Dynamic marketplace catalogs
description: Category visibility and historical inventory rules for property and service filters.
---

Administration-defined active categories must appear in public search and registration choices even before any property or service uses them. Never gate a category's existence on active marketplace inventory or substitute hardcoded categories when the catalog is empty.

**Why:** The user requires new property categories and service classifications to appear throughout the platform automatically, without a code change. An empty inventory result is not an absent category.

**How to apply:** Preserve the separation between property and service catalogs. Catalog changes need freshness for already-open pages as well as the admin writer's session; the public results may legitimately be empty for a newly created category.

Administrative filter options must include historical values from existing records alongside the administration catalog, and changing regions must remove only incompatible city selections.

**Why:** Disabling or removing a catalog option must not make existing administrative records inaccessible or leave an unrelated city filter silently excluding them.

**How to apply:** Keep OR matching within each multi-select and AND matching across independent filter groups. Service administration continues to use approved provider submissions as the source, with publication state read from their public mirror rather than assumed active.