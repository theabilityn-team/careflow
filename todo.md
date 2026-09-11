# CareFlow CRM Feature Tracker

## Completed fix: Save-time image limit

- [x] Remove the obsolete 6 MB validation from duplicate-check and lead creation.
- [x] Accept individual prepared images up to 25 MB during save.
- [x] Preserve the 32 MB per-lead full-quality transport boundary.
- [x] Validate all document payloads before creating the lead record.
- [x] Add regression tests for 6.7 MB, exactly 25 MB, over 25 MB, and over 32 MB combined.
- [x] Run the complete test suite and production build.
- [x] Verify runtime health and scan for obsolete 6 MB messages.
- [x] Save and publish the corrected version.
