---
name: Saudi currency presentation
description: Supplied SVG artwork, Unicode text boundaries and preserving edited WhatsApp templates
---
Use the user's supplied Saudi riyal SVG artwork throughout the platform, previews and cards. Monetary amounts display with Eastern Arabic digits. Plain WhatsApp messages use the official text sign U+20C1, never inline SVG/HTML.

**Why:** The user explicitly requested the attached artwork rather than the legacy «ريال» / «ر.س» amount units. Device fonts cannot be assumed to support this new Unicode sign, and a React SVG component cannot render inside text-only strings or placeholders.

**How to apply:** Keep the SVG as the artwork source and its single-glyph font fallback available wherever text units are rendered, including explicit font overrides and standalone print previews. Do not convert numeric form values, payment amounts, API currency codes, links or saved identifiers as part of presentation. Preserve property/person names containing the word «ريال» rather than treating them as amounts.

CSS mask URLs for imported SVGs must be quoted, even when the import looks like a normal asset path.

**Why:** Vite can inline the supplied SVG as a data URL containing quotes and parentheses. An unquoted CSS `url(...)` becomes invalid, silently drops the mask, and renders a solid square.

**How to apply:** Preserve quoted URLs for both standard and WebKit mask properties; a successful asset HTTP response alone does not establish that the icon is rendered.

WhatsApp template text must survive saving and reopening, including wording that does not contain phrases from the default templates.

**Why:** A legacy heuristic treated missing stock phrases as an outdated template and silently reset customized owner wording.

**How to apply:** Use defaults only for missing settings or an explicit reset action, not because a persisted message differs from stock copy. Keep highlight markup out of stored and sent template bodies.
