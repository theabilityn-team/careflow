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


## Password Management Visual QA

The default English staff login now includes a clear **Forgot password?** action beneath the password field. Its dialog explains the security model before any submission: the staff member enters the login email, the Super Admin reviews the request, and a one-time reset link is privately provided. The dialog fits cleanly within the existing desktop login card and keeps the normal sign-in form visible in context. No reset request or test data was created during browser visual inspection.

The public reset-password page was also verified with an invalid token. It reveals no account information, clearly explains that the link is invalid, expired, or already used, and provides a direct return to CareFlow. End-to-end API verification used a temporary staff account to test request creation, Super Admin link preparation, reset inspection, password replacement, automatic staff sign-in, old-password rejection, and one-time token reuse prevention. The same run changed and verified the Super Admin password, then restored the original configured password. All temporary users, sessions, and reset requests were deleted, and a database check confirmed zero QA records remain.


## Ownership, Groups, Classification, and Follow-up Reminder QA

The authenticated application was verified across **Lead groups**, **Leads**, an existing lead profile, **Bulk image import**, **Follow-ups**, and **System guide**. Lead profiles now show the operational state and diagnosis group immediately beneath the header, while the full Edit lead dialog includes required selectors for both fields. The Leads table includes prominent State and Diagnosis group columns, plus server-side filters for state, diagnosis group, and accessible lead group.

A database integration test created two isolated temporary staff identities and leads, then verified owner-only visibility, direct lead sharing, shared-group visibility, and unrestricted Super Admin visibility. Its temporary groups, shares, leads, audit artifacts, and users were removed after the assertions passed.

The Lead groups workspace is empty-state safe and clearly distinguishes owned and shared groups. The Groups & sharing dialog on a lead was opened and closed without changing production data. It provides current group membership, owner-manageable group selection, and direct staff access controls.

Follow-ups now acts as the staff-specific reminder center. Upcoming and overdue records are scoped to leads the current user may access. Two hours before the scheduled time, an unread in-app notification is displayed and counted in the sidebar. Reminder outbox rows are synchronized when a follow-up, assignee, or email changes. Bilingual English/Spanish email copy, state-based US time zones, three-attempt delivery tracking, and idempotency keys are covered by unit tests. The Super Admin sees a clear setup warning until an email sender and the scheduled processor are activated.

Existing legacy leads were intentionally not assigned an inferred state or diagnosis group. They visibly show **State not set** and **Diagnosis group not set** until an authorized person confirms those classifications; all newly created single and bulk image leads require explicit selections.


## Automatic State Classification Fix QA

The scanner now returns a normalized operational `stateCode` and both single and bulk image review flows automatically preselect Florida, Arizona, Nevada, or California from the extracted State / Province, full address, or ZIP code. Staff can still review and change the dropdown before saving. Deterministic tests cover full state names, two-letter abbreviations, complete addresses, supported ZIP ranges, and unsupported-state non-matches.

A startup backfill processed legacy leads whose operational state was empty. It inferred the state only from existing address data, wrote an audited `lead.state_inferred` event, and did not alter identity or clinical fields. A privacy-safe database check confirmed all three current leads now carry `FL`, and browser verification confirmed the Leads table displays **Florida** instead of **State not set**.


## Referral Document Adaptation and Strict Patient Dedupe QA

The document scanner was expanded for referral orders and referral forms. It now keeps patient identity separate from referring and receiving providers, and extracts insurance, authorization, requested visits, priority, appointment instructions, referral reason, ICD codes, CPT/HCPCS codes, and provider information into structured review sections. Social Security numbers and SSN-labeled values are excluded from scanner results and stored structured data.

All three user-provided referral samples were processed through the live authenticated scanner without creating records. The detected results were: referral form / Hematology / Florida; referral form / Oncology / Florida; and referral order / Hematology / Florida. Patient identity, date of birth, state, diagnosis group, and document type were available for review. A lead-count comparison before and after the scans confirmed that the verification was read-only.

Each new lead now stores the automatically detected source document type (`Referral order`, `Referral form`, `Medical record`, or `Other document`). The value is visible in the Leads list, prominent on the lead profile, editable by authorized staff, and included in the immutable audit trail. Existing leads with source images were backfilled from stored evidence; all three existing document-backed leads now have a source type and an audited system-backfill event.

Every image-created lead now requires first name, last name, and date of birth. The single and bulk workflows disable approval until those fields are present. Duplicate checks normalize those three fields, while email and phone remain additional signals. The same unique identity keys are enforced in the database to cover concurrent saves. Live read-only API verification confirmed both an existing-record match and an in-batch bulk match using first name + last name + date of birth. Database verification found complete identity-key coverage and no existing duplicate name/date-of-birth groups.

Visual QA confirmed source document labels in the Leads table and lead header, and the correction selector in Edit lead. The dialog was closed without saving, and no QA leads or temporary records were created.


## Independent Business Status and Interest Signal Fix QA

The reset behavior was traced to the partial update validation schema: create-time defaults for `status` and `interestLevel` were also being applied to partial updates. A status-only request could therefore inject `interestLevel: unknown`, while an interest-only request could inject `status: new`.

The update contract now explicitly keeps both fields optional with no defaults. Business Status and Interest Signal use separate optimistic mutations and loading states, and the database update applies only the supplied patch. Regression tests verify both parser directions and patch preservation. A live API test created one temporary record, changed Status and Interest in both directions, confirmed the other field remained unchanged each time, and then removed the lead, identity keys, audit events, session, and all temporary artifacts. A final database check confirmed zero temporary regression records remain.


## Regular Type, Pipeline Controls, Groups, and Follow-up Completion QA

The existing lead profile now displays **Regular** instead of Other/Medical record for non-referral source documents. Business Status and Interest Signal remain separate controls, each with its own pending state and Saving label. A prominent **Lead groups** card appears in the same top summary row, and the **Recent pipeline changes** card provides the latest audited Status and Interest before/after values without mixing the two fields.

The Leads page now keeps both **All statuses** and **All interest levels** visible beside search. Advanced filters remain under More filters, and existing rows display Regular consistently. Browser verification was read-only and did not alter any lead.

The Follow-ups page now explains the completion behavior above the queue and shows a **Complete** action on each accessible reminder. The dialog was opened without saving an existing record. It clearly states that the performed contact is logged, the current reminder disappears from Upcoming/Overdue when no next date is selected, and selecting a new date completes and reschedules the reminder instead.

Live read-only extraction of both provided Willie Freeman clinical chart screenshots verified **Regular** document classification, patient identity extraction, Florida state detection, Oncology diagnosis grouping, and no lead creation. A live API regression test created temporary data, verified automatic assignment to the creator's latest group, verified that completing an overdue reminder records a Communication and Audit event, clears `nextFollowUpAt`, and removes the item from the Follow-ups queue, then deleted all temporary data.

Final validation completed successfully: TypeScript check passed, all **63 unit tests** across 16 test files passed, the production build completed, the runtime is healthy, no temporary verification files remain, and the database contains no temporary QA records or legacy `other` / `medical_record` source document values. Current source types are normalized to **Regular** and **Referral form**.


## Follow-up Calendar, Completion Archive, and Oregon QA

The Follow-ups workspace now has three permission-scoped views: **Queue**, **Calendar**, and **Archive**. Desktop browser verification confirmed that the calendar highlights days containing reminders, month navigation loads a bounded date range, selecting a day displays its exact schedule, and authorized staff can open the same completion dialog from either Queue or Calendar. The completion dialog explains that the original reminder is archived, preserves its scheduled date, records the contact method, result, notes, completion time, and staff actor, and either closes the reminder or schedules the next one.

The Archive view was verified with a temporary completed record. Search, method and completion-period filters, result count, paginated table shell, original schedule, completion time, outcome, staff actor, next-reminder state, and lead navigation all rendered correctly. A live API regression test confirmed that an active reminder appears in the requested calendar range, disappears after completion, and is persisted in the archive with its original schedule and result. All temporary visual and API records were deleted afterward, and a final database query reported zero matching QA records.

**Oregon** is now supported throughout the application. It appears through the shared state catalog used by dropdowns and filters; is accepted by lead APIs; is inferred from `Oregon`, `OR`, and ZIP codes from `97000` through `97999`; is included in scanner instructions; uses the Pacific time zone for reminder messages; and is preserved in the shared row values used by CSV, Excel, and PDF exports. The live regression flow created and removed an Oregon lead successfully, and export regression coverage verifies the `OR` code and `Oregon` source field.

Final validation completed with **68 passing tests across 17 files**, a successful TypeScript check, a successful production build, healthy runtime status, healthy desktop visual verification, and no temporary verification scripts or database records.


## Lead Reminder Language and iPhone Photo QA

Reminder language is now a **lead-level setting**. Existing leads default to English. The setting is available during single-image intake, for every bulk image group, in Edit lead, prominently in the lead classification header, in the main Leads table, and as an always-visible Leads filter beside State. Staff accounts no longer expose a reminder-language preference. Staff reminder email copy remains English; only the lead email uses the lead's English or Spanish selection. Live authenticated API verification confirmed Spanish and Oregon filtering, independent language updates, and immutable before/after audit history; all temporary records were removed.

The image intake now accepts JPG, PNG, WebP, HEIC, and HEIF originals up to 25 MB each. JPG, PNG, and WebP bytes are read unchanged for OCR—there is no resize or compression step. HEIC/HEIF is decoded because the vision service cannot consume the Apple container; it is converted to JPEG at quality 1 while preserving source dimensions, with no resize. Per-lead prepared OCR payloads are capped at 32 MB to stay safely below the request limit without silently degrading images. Browser verification successfully converted a real native HEIC fixture to a full-resolution JPEG and accepted a 6.7 MB JPEG with an unchanged 8.93 MB data URL payload. Neither test started OCR nor created a lead, and all temporary fixture files were deleted.

The final TypeScript check, 71 unit tests across 18 files, and production build completed successfully.


## Save-time 25 MB Image Limit Fix QA

The remaining production error was traced to a separate server-side guard inside lead creation that still rejected decoded document bytes above 6 MB after duplicate checking. That obsolete guard was removed. The save path now accepts each prepared JPG, PNG, or WebP document through **25,000,000 bytes**, matching the intake UI, while retaining the **32 MB combined per-lead transport boundary** needed for the 50 MB request envelope. All document payloads are fully validated before the lead record is created, preventing a failed upload from leaving a partial lead.

Regression coverage confirms acceptance of a 6.7 MB iPhone JPEG and the exact 25 MB boundary, rejection at 25 MB + 1 byte, and rejection above 32 MB combined. The complete suite passes **75 tests across 19 files**, TypeScript validation passes, the production build succeeds, and the active source contains no `exceeds 6 MB` or `6_000_000` save-limit references.
