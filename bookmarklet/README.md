AutoApply Bookmarklet

A single-click bookmarklet that injects a UI overlay and autofills common fields on job application platforms (Workday, iCIMS, etc.). Data is stored in localStorage in your browser.

Files
- autoapply.js — main script
- loader.txt — one-line bookmark URL that fetches autoapply.js

Use
1) Navigate to a job application page.
2) Click the AutoApply bookmark.
3) In the overlay:
   - Fill your profile fields and click Save.
   - Click Fill now to autofill.
   - Enable Auto on changes to auto-refill on route/DOM changes.
   - Export/Import profile/settings JSON to sync between browsers.
4) Click ✕ to hide the overlay. Clicking the bookmark again will show it.

## Capabilities
- Text-only autofill: fills text inputs and textareas based on labels/placeholders/attributes.
- Vendor-aware heuristics for common platforms (Workday, Oracle, iCIMS) limited to text fields.
- Local storage of profile and settings, with import/export support.

## Notes and Limitations
- Non-text controls are intentionally not supported: no selects, radios, checkboxes, or ARIA comboboxes.
- Country/phone code is filled only when it is a text input; dropdown-only implementations are skipped.
- The UI may still include styles that reference <select> for future flexibility, but the autofill engine skips them.

## Changelog
- Simplified to text-only autofill. Removed all dropdown/combobox/radio helpers and related constants.
