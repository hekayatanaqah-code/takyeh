---
name: Results search context
description: Interaction rule for preserving and editing the active chalet city and date from the results page.
---

Homepage search must not offer “جميع المدن” in either property or service city selection.

**Why:** The user explicitly removed the all-cities choice from the homepage search bar.

**How to apply:** Keep actual catalog city choices and a clear city placeholder, with a city required before submitting the homepage search. Do not remove broader city filters from other pages as an incidental consequence.

Keep the active city and booking date visible and directly editable together in the sticky results toolbar. Synchronize both values with the results URL.

**Why:** Customers must be able to adjust the original search without returning to the home page, and refreshing or sharing the page must preserve the revised search context.

**How to apply:** Any future search-toolbar redesign must retain immediate result refresh, URL synchronization, and side-by-side city/date visibility on desktop and mobile.

City identity is an exact normalized match, ignoring hamza, diacritics, whitespace and letter case, while retaining the catalog's spelling for display. Do not use substring matching to make city searches permissive.

**Why:** The server and browser both filter cities; relaxing only one can still hide valid properties. Substring matching can mix distinct cities instead of merely accepting spelling differences.

**How to apply:** Keep main search, alternative-date search and browser filters consistent. Resolve a URL spelling to a catalog entry only when its normalized match is unique, and never turn a failed API request into an empty-success result.