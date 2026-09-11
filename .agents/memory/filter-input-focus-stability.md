---
name: Filter input focus stability
description: Why controlled fields in the chalet filter panel must not sit behind an unstable locally declared component identity.
---

Do not invoke the chalet filter panel through a React component function declared inside the page component. Render its element tree directly or move it to a stable top-level component with explicit props.

**Why:** A locally declared component receives a new identity whenever page state changes. React then unmounts and remounts the filter panel, causing controlled text and number inputs to lose focus after the first keystroke.

**How to apply:** When refactoring or reusing the desktop/mobile filter controls, preserve a stable component identity and verify multi-digit input with separate key presses rather than a single programmatic fill.