---
name: Playwright WebKit on Nix
description: Why Playwright's downloaded WebKit browser can fail to launch in the Replit Nix environment even when the test suite is valid.
---

Playwright's downloaded WebKit build targets Ubuntu and may require exact shared-library versions that are not exposed by the active Replit Nix channel. Adding similarly named Nix packages does not guarantee binary compatibility.

**Why:** WebKit browser installation can succeed while launch still fails on exact ICU, JPEG, GStreamer, or graphics-library sonames.

**How to apply:** Keep WebKit tests and configuration portable, validate test discovery and TypeScript locally, and run the browser scenario in a compatible Playwright runner. Do not permanently add a large Nix package list unless it actually launches the pinned browser build.