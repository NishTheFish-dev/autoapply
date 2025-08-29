AutoApply Browser Extension

A Chrome Manifest V3 extension that auto-fills common fields on job application platforms (Workday, iCIMS, etc.).

How it works
- Core autofill engine (`src/content/autofill/engine.js`) finds inputs, matches by label/name/placeholder synonyms, sets values, and dispatches events.
- Vendor modules (`src/content/vendors/*.js`) provide detect() and fill(profile) for Workday and iCIMS; falls back to generic heuristics.
- Content orchestrator (`src/content/content.js`) picks the vendor, listens for route changes and DOM mutations, and triggers auto-fill.
- User data stored locally via `chrome.storage.local` (`src/common/storage.js`). Options page lets you edit/import/export.

Install (Chrome)
1) Open chrome://extensions
2) Enable Developer mode (top-right)
3) Click "Load unpacked" and select this folder: extension/
4) The "AutoApply" extension appears with a toolbar icon.

Usage
1) Click the toolbar icon > Options. Fill your profile.
2) Open a job application page on Workday/iCIMS.
3) Open the popup. Toggle "Enable autofill on this site". Click "Fill now" to test.
4) Autofill runs automatically on route/page changes when enabled for the site.