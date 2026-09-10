# CareFlow CRM Visual QA

Desktop verification at 1440×1000 confirmed that the dashboard, scanner, leads, and staff administration pages render without overflow or broken components. Mobile verification at 390×844 confirmed that the compact navigation, dashboard cards, upload area, lead filters, empty states, and Super Admin directory reflow correctly.

The authentication update was verified on desktop and mobile. The application now opens on a private English credential screen with separate **Staff email** and **Super Admin** modes. The mobile layout is legible without horizontal overflow, inactive tabs retain sufficient contrast, and invalid invitation links display a clear recovery action.

The complete local Super Admin flow was tested end to end: login returned HTTP 200, the authenticated session resolved to a local administrator, and logout returned HTTP 200. Final TypeScript checks, five unit tests, and the production build pass.


## Lead Audit Update QA

The updated login screen remains visually stable after the audit implementation. The CareFlow authentication page loads successfully in the stateful browser and exposes the separate Staff email and Super Admin login modes without layout regressions.

The Super Admin browser login succeeded with the configured local credentials and opened the live dashboard. An existing lead record was present; it was treated as real data and was not modified. No test leads, test controls, or QA messages will be left in the application. Automated Vitest files remain development-only and are not exposed in the production interface.

The existing lead profile was opened read-only for visual verification. The updated navigation now separates **Communications** and **Audit trail**, shows the audit event count, and exposes the expanded **Edit lead** action without altering the record. The real lead data remained unchanged.

The expanded **Edit lead** dialog was opened and closed without saving. It correctly exposes pipeline status, interest, assigned staff, next follow-up, all contact and identity fields, diagnosis, clinical notes, and structured additional information. The modal is scrollable and preserves the existing record when dismissed.

After the non-destructive migration, the existing lead now reports two audit entries: its legacy creation event and a clearly labeled current-state audit baseline. The lead itself was not edited. The updated page, tabs, and profile cards remain visually stable after the production build.

The refreshed profile confirms the audit count increased from one legacy event to two entries after the baseline migration, while all lead values and timestamps remained unchanged.

Final runtime verification reports a healthy development server, no TypeScript or language-service errors, nine passing unit tests, and a successful production build. The production UI scan found no test-lead labels, QA-only controls, dummy data, or test buttons.


## Lead Export Update QA

The permission-aware **Export leads** action renders beside **New lead** on the English Leads page without disturbing the existing filters or table layout. No lead record was created or modified during this read-only visual check.

The export dialog correctly displays all 14 lead statuses with live record counts, defaults to all statuses when the list filter is set to All, and offers CSV, Excel, and PDF. The summary confirms the matching lead count, 5,000-row limit, status column, and explicit exclusion of clinical data and source documents. No export was triggered during browser QA.

Status-selection interaction was verified read-only: **Clear all** produced zero matching leads and disabled the export action; selecting only **Verified** restored the correct count of one; selecting PDF changed the primary action to **Export PDF**. The dialog was then closed without generating a file, so no export audit event or download was created during UI QA.

Temporary local sample files used for binary validation were deleted. The CSV was identified as UTF-8 with BOM, the XLSX passed ZIP integrity checks and contained a Status column, and the PDF was identified as a valid single-page A4 landscape document containing the report title, selected status, lead row, and assigned staff.

Final verification reports 13 passing unit tests across authentication, permissions, auditing, and exports; a successful TypeScript check and production build; healthy runtime status; and no production test strings or temporary export files. The only build notice is the existing non-blocking Vite bundle-size advisory.


## Contact Copy and Tracking Clarity QA

The existing lead profile now presents **Most recent contact** and **Scheduled follow-up** with clear empty states and an English explanation of how each field is populated. Email and phone each have a visible Copy action with accessible labels. The layout remains balanced at desktop width, and no lead data was edited during this read-only inspection.

The profile **Copy email** control was exercised successfully in the browser and displayed the confirmation toast **Email address copied.** This action only touched the local clipboard and did not create or change any application record.

The **Log communication** dialog now states the exact system behavior: save time becomes Most recent contact; a scheduled date sets Follow-up required; leaving it blank sets Contacted and clears an existing reminder. The dialog was opened read-only and no communication was saved.

The Leads table now shows both email and phone when present, each with a compact accessible copy action. The former Next follow-up column is now **Follow-up reminder** and clearly displays **No reminder — Set from Log contact or Edit lead** for empty values. Copy button clicks stop row navigation so users remain on the list.

Final verification reports 17 passing unit tests, a successful TypeScript check and production build, healthy runtime status, and no production test strings. The existing non-blocking Vite bundle-size notice remains unchanged.


## Image-only Lead Flow, Explicit Status, and Duplicate Protection QA

The navigation and dashboard now present one clear intake path: **Add lead from images**. The screen accepts only JPG, PNG, and WebP images for one person, explains mandatory human review, and contains no CSV or Excel import interface. The review action performs a visible duplicate check before creation.

The new **System guide** documents image intake, identity matching, communication logging, follow-up scheduling, manual status changes, permissions, audit history, and exports. The guide includes definitions for all 14 statuses and states that contact activity and follow-up dates do not change status.

The existing lead profile was inspected without modifying data. **Business status**, **Interest signal**, **Most recent contact**, and **Scheduled follow-up** are visibly separate. The Log communication dialog explicitly states that saving contact updates contact time, may add a reminder, never changes status, and preserves an existing reminder when no new date is entered. No communication or status change was saved during QA.

The database migration created unique lead identity keys. Existing leads were backfilled and the authenticated duplicate-check endpoint matched an existing lead using three identity signals without creating or changing any lead record.


## Bulk Image Import and Lead List Filtering QA

The application now includes a dedicated **Bulk image import** route and navigation item. Each person is represented by a separate lead group, and each group accepts one to six JPG, PNG, or WebP source images. The batch is bounded to ten lead groups and twenty total images. Processing is sequential, every extracted draft requires explicit human approval, and the final action checks both existing-record duplicates and duplicates between groups before creating unique approved leads. Adding a second empty lead group was verified in the browser; no files were uploaded and no lead records were created during QA.

The Leads page now performs filtering, sorting, totals, and pagination on the server. Available filters are Status, Interest, Assigned staff (including Unassigned), Follow-up state, Contact history, Created from/to dates, and free-text search across name, email, phone, city, and address. Sorting supports recently updated, newest created, name A–Z/Z–A, and next follow-up. Page sizes are 10, 25, 50, or 100. A read-only browser check filtered to **No reminder** and correctly reduced the result count from two to one. A direct authenticated API check confirmed paged metadata and in-batch duplicate detection without modifying data.


## Hidden Super Admin and Users Cleanup QA

The default CareFlow login now exposes only the staff email and password form; it contains no Super Admin label, tab, username, or link. The restricted administrator form appears only when the operator manually adds the `super-login` query parameter, for example `/?super-login=1`. The backend also requires the explicit `super_admin` login mode, so the old payload and staff-email mode cannot authenticate the system administrator.

The database contained one legacy Google/Manus OAuth user with no related records and one row-backed Super Administrator. Both rows were removed from `users`, together with their obsolete local credentials and sessions. Super Admin credentials and sessions now live in dedicated system security tables, so the administrator is not represented as a user or staff member. Existing lead ownership and audit history were preserved through the stable system actor ID, and live verification confirmed the audit UI still resolves those events to **Super Administrator**. The `users` table and Staff directory are now empty until real technical staff are created through invitations.


## Super Admin Email Login Fix QA

The hidden `/?super-login=1` form now shows the fixed, read-only Super Admin email **admin@admin.com** together with the password field. The API requires the same exact email for `super_admin` mode and rejects any other identifier. The dedicated system credential was synchronized to `admin@admin.com`, its failed-attempt counter and temporary lock were cleared, and a live end-to-end request verified successful login, the expected system administrator session identity, and logout with the existing private password. The complete suite reports 34 passing tests, a clean TypeScript check, and a successful production build.
