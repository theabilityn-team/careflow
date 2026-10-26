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


## Voicemail Left Status QA

The default staff login and hidden Super Admin login remain visually stable before authenticated status verification. No application data was changed during these navigation checks.

The Super Admin session was opened successfully for read-only **Voicemail left** status verification. An existing lead profile loaded normally, with Business Status and Interest Signal still presented as separate controls. No existing lead was changed during this step.

The Business status dropdown now visibly includes **Voicemail left** between **To be contacted** and **Contacted**. The dropdown was inspected without selecting a value, and the existing lead remained unchanged. The Leads workspace also loaded normally with its status filter available for the expanded shared status catalog.

The main Leads status filter visibly includes **Voicemail left**. Selecting it issued the normal server-side filtered query and displayed a clean zero-results state because no real lead currently uses that status. The separate temporary API regression had already confirmed that a lead set to this status is returned by the same filter and receives one audited before/after status event; that temporary lead and its audit row were deleted.

The live database enum now contains `voicemail_left`. The status is available in creation review, quick Business status changes, Edit lead, Leads filtering, export selection, and the System guide dictionary. CSV, Excel, and PDF share the **Voicemail left** label. The complete suite passes **76 tests across 19 files**, TypeScript validation and the production build succeed, runtime checks report no errors, and the final database inspection confirms that no temporary Voicemail status records remain.


## Per-staff SMTP Sender QA

Browser QA used a temporary technical-staff account and disposable nonworking SMTP values only; no real mailbox credentials or emails were used. Staff login succeeded and the **Email settings** navigation item appeared in the technical-staff workspace. The page rendered host, port, TLS mode, username, password, sender identity, reply-to, enabled switch, connection test, test-email, and save controls.

Enabling SMTP with missing required credentials was rejected with the exact validation message **Host, port, username, password, and sender email are required before enabling SMTP.** Saving a disabled disposable configuration succeeded, and the password field was immediately cleared in the browser. The page explicitly states that settings are stored in `staff_smtp_settings` and that saved passwords are never returned by the API.

Pending final checks at this point: reload/API secret-absence verification, Follow-ups and Super Admin visual checks, browser console review, temporary QA-account cleanup, final database audit, and checkpoint.

The saved-page reload displayed **Saved — leave blank to keep it** while the actual password input value remained empty. An authenticated `emailSettings.get` API check returned HTTP 200, reported only `hasPassword: true`, contained no `smtpPassword` field, and did not contain the disposable saved secret.

The technical-staff **Follow-ups** page showed the correct per-user readiness warning, explained that reminders for assigned leads will come from the staff member's own address, retained in-app reminders, and provided a working **Open Email settings** shortcut. Queue, Calendar, and Archive remained visually intact.

The temporary technical-staff session was ended before administrator-side verification.

The existing hidden `/?super-login=1` administrator entry point remained intact and separate from the normal staff login during this update.

Super Admin login succeeded. **Staff & access** displayed one SMTP readiness badge per technical staff member (`SMTP not configured` for the existing unverified rows) and showed no SMTP password, username, host, or editable SMTP credentials. The separate technical-staff Email settings route remained absent from the Super Admin sidebar.

The Super Admin **Follow-ups** page correctly reported the aggregate readiness count (`0 of 3 active staff SMTP accounts are verified`) while the temporary QA account still existed, and it did not offer Super Admin a mailbox configuration page. No application runtime errors appeared in the browser console during the staff or administrator SMTP checks.

Final verification passed with **84 tests across 21 files**, a clean TypeScript check, and a successful production build. The build emitted only the existing non-blocking Vite bundle-size advisory. The development runtime returned HTTP 200 and the latest server log contained no new runtime or TypeScript errors.

The live database contains the `staff_smtp_settings` table with all expected plaintext SMTP and verification columns. After cleanup, there are exactly two real technical staff accounts and two matching SMTP rows, zero missing staff rows, zero enabled or verified SMTP rows, and zero QA users or QA credentials. No real SMTP delivery was attempted because no staff mailbox credentials have been configured. All temporary QA files, sessions, users, permissions, and disposable SMTP data were removed.


## Super Admin SMTP Management Update QA

Super Admin now sees **Email settings** in the sidebar. The page opens in management mode with an account selector, defaults to **Super Administrator · admin@admin.com**, and exposes the complete SMTP form, enable switch, connection test, test-email action, and save action. No real SMTP credentials were entered during visual verification.

After adding the Mails workspace, Super Admin navigation showed both **Mails** and **Email settings**. The SMTP page rendered the account selector and full editable form only in administrator mode.

The Super Admin SMTP selector listed the dedicated administrator profile and both real technical staff accounts. Selecting a staff member loaded that person's centrally managed SMTP form and preserved an empty password input; no settings were changed.

The new **Mails** workspace rendered correctly for Super Admin with the prominent received-mail login notice, Compose, Sent history, and Header & footer tabs. The composer showed access-scoped lead selection and personalization tokens. The template tab loaded the predefined CareFlow HTML header and footer without creating a database record or sending an email.

Super Admin session was ended before staff-role QA. The normal login continued to expose only the staff sign-in flow.

A removable technical staff account signed in successfully. Its sidebar included **Mails** and **Email settings**, while Super Admin-only Staff & access remained hidden.

The staff **Email status** page showed only the assigned sender email, Active/Inactive state, verification state, last test time, and Test connection / Send test email actions. No SMTP host, port, username, password, sender-name, reply-to, enable switch, or save action was present. The connection test returned a generic instruction to ask Super Admin, without exposing SMTP diagnostics.

The technical staff **Mails** page showed the outbound-only inbox notice, Compose, Sent history, and Header & footer tabs. Staff could edit their own predefined HTML header/footer while SMTP credentials remained unavailable. The QA staff had no accessible leads, confirming recipient selection stayed access-scoped. No email or template was saved during browser QA.

Browser console QA showed no runtime errors. The authenticated staff Email settings API returned HTTP 200 in read-only mode with `fromEmail`, but omitted `smtpHost`, `smtpUsername`, `smtpPassword`, `fromName`, and `replyToEmail` entirely.

Final validation passed with **94 tests across 23 files**, a clean TypeScript check, a successful production build, HTTP 200 runtime health, and no recent runtime errors. The build emitted only the existing non-blocking Vite bundle-size advisory.

The live database contains two real staff accounts, three SMTP rows including exactly one dedicated Super Admin profile, and the new `email_templates` and `outbound_emails` tables. HTML template and sent-body columns are `MEDIUMTEXT`. There are zero email template rows and zero outbound history rows because QA did not save a template or send an email. All temporary QA users, credentials, sessions, SMTP settings, templates, history, and scripts were removed. No real SMTP credentials were entered and no external email was sent.


## Hospital Facesheet update — 2026-09-18

Two supplied Jackson Health System Facesheet examples were treated as **Hospital Facesheet — standard layout** and **Hospital Facesheet — extended layout**. Development browser QA used the existing hidden Super Admin login and will not save a lead or source document.
The latest Add lead page loaded successfully and now explicitly states that referrals and Hospital Facesheets are supported across both layouts, with patient details separated from hospital contacts, guarantors, insurers, facilities, providers, admissions, diagnoses, and procedures.
The scanner accepted automation access to its existing image input without changing application code. The supplied standard-layout sample was prepared for a non-saving end-to-end extraction check.
The real scanner accepted `scanNew1.jpeg`, showed the preview at 1/6 images, and began the OCR request without client-side upload or size errors. The extraction remained in progress during the initial browser wait; no Create lead action was taken.
End-to-end browser extraction completed successfully at 95% confidence and classified the sample as **Hospital Facesheet — standard layout**. The review screen separated patient identity and contact data from hospital encounter, next of kin, emergency contact, guarantor, primary/secondary insurance, care team, and clinical sections. It extracted the handwritten diagnosis as `Colon Cancer`, suggested Oncology, and displayed warnings for the handwritten source and unknown address. No lead was created, no document was stored, and the browser console had no runtime errors.


## Product email template library — 2026-09-19

Browser QA started on the development site. The hidden Super Admin login remained intact; the new `/email-templates` route correctly required authentication before exposing management controls.
Super Admin signed in successfully. The sidebar now includes **Email templates** between Mails and Email settings, and the entry is role-gated to Super Admin in the application navigation.
The Super Admin Email templates workspace rendered the correct empty state, central-library explanation, and Add product action. The product dialog exposed name, description, sort order, and active-state controls with no staff-only actions mixed into the page.
A removable active QA product was created successfully through the Super Admin form. It appeared immediately with Active status, template count, Edit, Archive, and Add template controls.
The Add email template dialog automatically selected its product and exposed internal name/description, email subject, message, sort order, active state, and the four supported personalization tokens. The removable QA template used both lead and sender tokens for end-to-end selection testing.
The removable template saved successfully and appeared under its product as **Available to staff**. The Mails Compose tab rendered a new approved-template panel with separate Product and Email template selectors while keeping subject and message editable.
The active QA product was the only option in Compose. Selecting it enabled the Email template selector without altering the current draft until a specific template was chosen.
Selecting the QA template populated both subject and message, preserved all personalization tokens, showed the applied template description, and left both fields editable. No lead was selected and no email was sent.
The composer verification stopped before choosing a lead; no outbound SMTP call, sent-history row, or lead communication was created.
The applied draft remained stable while preparing to switch roles; the Send action stayed disabled because no lead was selected.
Super Admin logout returned to the normal staff-only sign-in screen before technical-staff role verification.
A removable technical-staff account with Manage communications permission signed in successfully. Its sidebar included Mails but did **not** include the Super Admin-only Email templates or Staff & access pages.
The technical-staff Mails page displayed the approved-template selectors and listed the active QA product. No product/template create, edit, archive, or inactive-library controls were present for staff.
Technical staff selected the active product and template successfully; subject and message were populated and remained editable. Direct navigation to `/email-templates` rendered **Email templates unavailable — Only Super Admin can manage products and reusable email templates.** No email was sent.
Cleanup removed the temporary product, template, technical-staff user, credentials, permissions, SMTP row, and sessions. Final counts were `qaProducts=0`, `qaTemplates=0`, `qaUsers=0`, and `qaOutbound=0`.
After QA cleanup, the browser returned to normal staff login and the console contained no warnings or errors from the Super Admin or staff template workflows.
Final validation passed with **104 tests across 25 files**, a clean TypeScript check, a successful production build, HTTP 200 runtime health, migration 0016 registered, live `email_products` and `email_message_templates` tables present, all four immutable sent-history snapshot columns present, no runtime log errors, and zero temporary QA products, templates, users, or outbound messages.


## HTML email template upload and test-recipient update — 2026-09-19

Browser QA began through the existing hidden Super Admin login. A temporary `.html` file containing valid email markup plus intentionally unsafe script/event-handler content was prepared to verify upload, sandboxed preview, server-side sanitization, and cleanup without sending a real email.
Super Admin HTML-upload QA opened the updated Email templates page successfully. An existing real product, **MB Aura Vortex K-1**, with the plain-text template **BOGO Deal** was preserved and not modified; the page now clearly distinguishes plain text from uploaded HTML templates.
The updated Add email template dialog rendered both **Plain text** and **HTML design** formats under the existing real product without changing its current template.
The `.html` file uploaded successfully, switched the editor to Preview automatically, preserved all four personalization tokens, and rendered the design inside a sandboxed iframe. The original file remains local to the save operation and is not publicly hosted.
Saving succeeded. The product count increased to two templates, the new entry displayed **HTML**, retained the source filename, and remained separate from the existing BOGO Deal plain-text template.
A privacy-safe database check confirmed the saved template had `contentMode=html`, retained the table layout and filename, generated a plain-text fallback, and contained neither `<script>` nor `onclick`.
The Mails composer clearly stated that both plain-text and HTML templates are supported, and listed the existing active product for selection. No lead was selected and no email send was attempted.
After choosing the product, Compose listed both the real template as **Plain text** and the removable QA template as **HTML**, making the format explicit before staff applies a draft.
Applying the HTML template filled the subject, opened a sandboxed visual preview, and provided an Edit HTML source view. The loaded source already showed server sanitization: the script and inline event handler were absent, while valid layout, links, token placeholders, and a safe `rel` attribute remained. No lead was selected and no email was sent.
The Send test email action now opened a required dialog with an editable recipient email, Product selector, and Email template selector. It no longer immediately sends to the account address or uses a fixed default message; the Send button remained disabled until a template was chosen.
The recipient field accepted a different address, and the test-email Product selector listed the active real product. No request was submitted.
The test-email dialog required a product before enabling its template list and showed both active templates with explicit Plain text/HTML labels. The fixed default message is no longer available.
After recipient, product, and HTML template were selected, Send test email became enabled. QA used Cancel, so no message was sent and the verified SMTP account state was not changed.
A removable technical-staff account was created for role-specific Email status verification. Super Admin logged out cleanly and the normal staff-only sign-in page appeared.
The removable technical-staff account signed in successfully. Its navigation included Mails and Email settings but excluded the Super Admin-only Email templates library.
The same required recipient, Product, and Email template dialog opened from the technical-staff read-only Email status page. Staff still saw no SMTP credential fields or template-management controls. QA cancelled before selecting or sending, so no SMTP request was made.\n
Cleanup removed the temporary HTML template, temporary staff user, credentials, permissions, SMTP row, session, local QA files, and related browser artifacts. The real **MB Aura Vortex K-1** product and **BOGO Deal** template were explicitly rechecked and preserved.
Final validation passed with **110 tests across 25 files**, a clean TypeScript check, a successful production build, HTTP 200 runtime health, no recent runtime/TypeScript log errors, a registered and applied migration 0017, all three live HTML-template columns present, zero temporary QA users/templates/outbound messages, and the existing real product/plain-text template preserved.


## Super Admin-only global email frame — 2026-09-19

Browser QA started from the normal staff-only sign-in page using a removable technical-staff account. The goal is to confirm the Header & footer tab and its API are unavailable to staff while Super Admin retains the global editor.
The removable staff account signed in successfully with Manage communications access and no Super Admin navigation.
The technical-staff Mails page displayed only **Compose** and **Sent history**. **Header & footer** was absent, no frame query was issued by the page, and a direct authenticated request to `mail.template` returned HTTP 403. Compose explains that the Super Admin-managed global frame is added automatically.
The temporary staff session ended cleanly. The hidden Super Admin login remained available for confirming that the global Header & footer editor is still accessible to administrators.
Super Admin signed in successfully. In Mails, **Header & footer** remained visible alongside Compose and Sent history, and the page description now identifies it as the global HTML frame.
Opening the tab showed **Global HTML header and footer**, explicitly stated that Super Admin controls it for every CareFlow account, and noted that technical staff cannot view or edit it. No values were changed or saved during QA.
Cleanup removed the temporary technical-staff user, credentials, permissions, session, local QA scripts, and browser artifacts. No real email, SMTP, lead, template-library, or global frame data was modified.
Final validation passed with **111 tests across 25 files**, a clean TypeScript check, a successful production build, HTTP 200 runtime health, no recent runtime/TypeScript log errors, clean diff checks, and no temporary QA files. Existing global frame values were read-only during QA and were not modified.


## Eastern Time and independent follow-ups — 2026-09-19

CareFlow now treats **America/New_York** as the single business timezone for every date/time input, calendar range, list, detail view, email/reminder copy, and export. Winter timestamps show EST and summer timestamps show EDT. UTC milliseconds remain the internal storage format.

The follow-up data model now preserves multiple active reminders for one lead. The lead-level Next follow-up value is derived from the earliest active reminder rather than replacing sibling reminders. Every active item has its own ID and supports **Complete**, **Edit**, and **Delete**. Completion archives only the selected item; edit reschedules only that item; delete removes only that reminder and keeps communication history.

Migration `0018_mixed_rachel_grey.sql` added source communication and actor metadata, indexes, and a data-preserving backfill. A one-time post-restart repair restored the second real uncompleted schedule that the legacy development process had briefly collapsed during the migration window. Final privacy-safe database verification found **2 active follow-ups on 1 lead**, both linked to their source communications, zero missing active schedules, and zero mismatched lead pointers.

Non-destructive browser QA confirmed two separate queue items and notifications, two items on the same Eastern calendar day, an Edit dialog with the correct ET value and selected-item wording, a Delete confirmation that explicitly preserves other reminders and communication history, and the lead profile showing the earliest Next follow-up plus **2 active reminders**. No edit, delete, completion, or notification-read action was submitted.

Final automated validation passed with **112 tests across 26 files**, a clean TypeScript check, a successful production build, HTTP 200 runtime health, no new post-migration server errors, and no browser console errors.


## Direct lead email and cross-staff email history — 2026-09-20

Each accessible lead profile now shows **Send email** beside **Edit lead** and the renamed **Contact & follow-up** action. The dialog supports the same active product library, approved plain-text/HTML templates, editable subject/message, personalization tokens, HTML preview/source editing, global Super Admin frame, and logged-in sender SMTP path as the central Mails workspace.

The new **Emails** tab displays the exact successful count plus failed/total attempts for that lead across every sender account, not only the current staff member. Rows identify sender, from address, recipient, product, template, status, and Eastern Time; authorized lead viewers can open the immutable stored message preview. Lead access rules are enforced before summary or message retrieval, and staff receive generic delivery failures rather than SMTP diagnostics.

Browser QA opened an existing accessible lead with an email address, confirmed the three adjacent header actions, selected the real active product and approved template, verified draft population, then selected **Cancel**. No SMTP request, outbound-history row, or Communication row was created. The lead Emails tab rendered the correct zero-count empty state. Browser console inspection returned no errors, and artifacts containing the inspected lead details were deleted.

Final validation passed with **115 tests across 26 files**, including new cross-staff history authorization tests, a clean TypeScript check, successful production build, HTTP 200 runtime health, clean diff whitespace, no temporary QA files, and no remaining `Log contact` interface copy.


## Email open and click tracking — 2026-09-20

CareFlow now instruments newly sent lead emails with an opaque 64-character open token and signed HTTPS/HTTP click redirects. Automatic emails sent to leads are included; internal staff follow-up notifications are intentionally not tracked. The stored message preview remains clean and does not contain the pixel or rewritten redirect links.

A privacy-minimized endpoint verification inserted one temporary non-delivery history row, requested the development open-pixel endpoint, followed a valid signed click without reaching the external destination, and confirmed `openCount=1`, `clickCount=1`, and both first-event timestamps. Invalid tokens do not write events, tampered click signatures return 404, and the temporary row was removed immediately.

Browser QA as Super Admin confirmed the central **Mails → Sent history** view shows an accuracy/privacy notice and open/click badges. Existing messages sent before tracking are correctly labeled **Tracking unavailable for this older email**, rather than falsely reporting that they were not opened. One removable tracked history row verified lead-level totals, row badges (`2 opens`, `1 click`), and detailed first/latest Eastern Time timestamps. It was deleted after verification; no SMTP send, lead communication, or permanent QA record was created.

The UI explains that opens require image loading and that privacy protection or security scanners can create automatic events. CareFlow stores only first/last timestamps and aggregate counts; it does not store recipient IP addresses, device data, user-agent strings, or browser fingerprints. Tracking tokens are omitted from both staff and Super Admin APIs.

Final validation passed with **118 tests across 27 files**, a clean TypeScript check, a successful production build, and HTTP 200 runtime health. The public development tracking route returned a 34-byte GIF with no-cache and no-referrer headers. Migration `0019_magical_famine` is registered and live with all seven engagement columns plus the unique tracking-token index. The final database audit found four preserved historical emails, zero tracked legacy rows, zero engagement events, and zero temporary QA records. Browser console QA reported no warnings or errors, and all screenshots/page artifacts containing real lead details were removed.


## Visible HTML template editor correction — 2026-09-22

The Super Admin email-template dialog no longer hides HTML behind a compact message-format dropdown. It now shows two large, explicit choices—**Plain text** and **HTML email**—plus an always-visible **Upload HTML** action for `.html` and `.htm` files up to 250 KB. The HTML mode exposes **Edit HTML** and **Preview** controls directly.

Pasting full HTML into the plain-message field is detected automatically and switches the form to the HTML source editor without losing the pasted markup. Browser QA opened the existing BOGO template, verified both visible format choices and the upload action, switched to HTML explicitly, then pasted a full HTML table into the plain field and confirmed the automatic switch and success message. The dialog was canceled without saving, so the real template remained unchanged.

Validation passed with **119 tests across 27 files**, a clean TypeScript check, and a successful production build.


## Per-template Send test action — 2026-09-22

Every active template on the Super Admin **Email templates** page now has a **Send test** action beside Edit and Archive. The dialog keeps the selected template fixed, lets the administrator select any active SMTP mailbox, and requires an explicit recipient email address. It labels each sender as verified, not verified, disabled, or inactive; disabled and inactive mailboxes cannot be selected. The dialog states clearly that the action sends a real email and that lead tokens render with test-recipient values.

Browser QA verified both real MB Aura templates display the new action. The Product Introduction dialog defaulted to the verified Super Admin sender, accepted a non-deliverable `.invalid` recipient, and enabled the send button only after all required values were present. The dialog was canceled, so no email was transmitted and no real template or SMTP data was changed. The browser console remained clean.

Final validation passed with **120 tests across 27 files**, a clean TypeScript check, and a successful production build.


## Responsive email template editor — 2026-09-23

The Super Admin email template editor was rebuilt as a dedicated responsive modal. On desktop it uses an enlarged workspace up to 94% of the viewport and 1,480 px, with **Template details** and **Email content** arranged side by side. On phones it becomes a 96dvh full-width bottom sheet with a rounded top, one-column controls, vertical-only scrolling, and persistent **Cancel** and **Save template** actions.

The long HTML source is contained inside its own editor instead of expanding the modal. Upload, format choice, Edit HTML/Preview controls, metadata, sort order, and active state remain available. The header and footer stay visible while only the central content scrolls.

The real component was visually verified at **1440 × 1000** and **390 × 844** using an isolated development fixture, then verified again on the authenticated real `/email-templates` route without saving any template changes. Desktop DOM assertions confirmed no body, document, or dialog-level horizontal overflow and visible persistent actions. Browser console contained no warnings or errors. Temporary QA routes, scripts, browser dependencies, screenshots, and page artifacts were removed.

Final validation passed with **121 tests across 27 files**, a clean TypeScript check, and a successful production build.


## Global email header/footer code and live preview — 2026-09-23

The Super Admin **Mails → Header & footer** workspace now has a dedicated two-column desktop editor: dark monospaced HTML code panels for the global header and footer, Copy actions for each section, and an adjacent live recipient preview. On phones, explicit **HTML code** and **Live preview** controls switch between the two full-width views.

The preview is generated by a new Super Admin-only server procedure using the same sanitization, personalization, and final email-frame composition functions used during SMTP sending. It displays safe sample lead and sender values, never sends email, and refreshes after draft changes. The Save action remains disabled when nothing changed and clearly marks unsaved source edits.

Browser QA confirmed the authenticated desktop layout, visible header/footer code, Copy actions, sample header/body/footer rendering, unsaved preview refresh, and full reset without saving. A 390 × 844 authenticated phone simulation confirmed both mobile modes, a visible Save state, and **0 px** page-level horizontal overflow. No database row or email was changed. Browser console reported no warnings or errors.

Final validation passed with **122 tests across 27 files**, a clean TypeScript check, successful production build, HTTP 200 runtime health, and clean repository/temporary-file audits.


## Application-wide mobile remediation QA — 2026-09-23

CareFlow received a broad mobile remediation rather than a screenshot-specific patch. Shared buttons, icon controls, selects, switches, tabs, dialogs, alert dialogs, sheets, sidebar controls, page headers, and loading shells now use phone-safe sizing and containment. Standard dialogs stay within the dynamic viewport, scroll internally when necessary, stack their actions on narrow screens, and include bottom safe-area protection. The sidebar provides an explicit 44-pixel close target and also closes immediately when a menu destination is selected.

Every primary authenticated route was inspected without changing application records: Dashboard, Leads, an existing lead profile, Lead groups, Add lead from images, Bulk image import, Follow-ups, Mails, Email templates, Email settings, System guide, and Staff & access. At 320 pixels, all routes reported document `scrollWidth` equal to `clientWidth`. The same 12-route audit passed at 360 and 390 pixels with no page-level horizontal overflow. Key desktop routes were then checked at a 1,280-pixel iframe viewport and showed no document overflow or missing desktop sidebar.

The Leads workspace now renders structured cards below the desktop breakpoint while preserving the desktop table. Mobile cards keep classification, interest, follow-up, and contact information readable; the footer presents responsive totals, page size, and compact pagination. The Lead profile action area was verified at 320 pixels with Edit lead, Contact & follow-up, and Send email all inside the viewport. On an existing lead with an email address, the composer opened as a 312-pixel-wide bottom sheet inside the measured mobile viewport, and its Send email action remained visible as a 280-pixel-wide fixed footer control. The dialog was closed without sending an email.

The dedicated template-test dialog was opened on an existing active template without entering or sending a recipient. At the narrowest measured viewport, the bottom sheet remained fully contained, its SMTP selector and recipient input each measured 272 pixels wide, and its Cancel and Send test email actions remained visible in the safe-area footer. Scanner and Bulk image import now reduce nested phone padding, enlarge image-removal targets, wrap warnings/errors, and stack batch actions; Bulk image import no longer nests a remove button inside the group expansion button. Follow-ups uses smaller 320-pixel calendar cells and mobile-safe notification, row, and warning layouts.

A real sidebar interaction was exercised at 320 pixels. The opened sheet reached its final in-viewport position, exposed a 44×44 close button, and showed 44-pixel menu rows. Selecting Mails navigated to `/mails`, removed the sheet from the DOM, restored normal body overflow, and left the route at zero horizontal overflow. No lead, follow-up, group, staff, SMTP, template, or email data was created, edited, deleted, or sent during this QA.

Final automated validation passed with **122 tests across 27 files**, a clean TypeScript check, a successful production build, HTTP 200 runtime health, and `git diff --check` with no whitespace errors. The only build notice remains the existing non-blocking Vite chunk-size advisory. Temporary browser screenshots, page captures, HTML dumps, console-output files, and the injected QA iframe were removed after verification.


## Email library copies and lead group management QA — 2026-10-25

Added Copy product and Copy template to the Super Admin email library. Copy product opens an editable prefilled dialog with a unique suggested name and copies every source template, including archived entries, in a single transaction. Copy template opens the existing responsive editor in Copy mode, preserving plain/HTML content, subject, description, filename, order, and availability while allowing a different destination product. Neither action changes an original record, and nothing is written until Create copy is selected. Nested Drizzle duplicate errors now map to a clear name conflict instead of an internal error.

Live integration verification used a disposable inactive copied product, checked exact template content/status retention, fresh IDs and administrator attribution, unchanged original product/templates, duplicate-name CONFLICT handling, and a forced duplicate-template insertion failure. The failed transaction left no product. All disposable product/template rows were removed in finally cleanup.

Lead groups now exposes Edit group and Remove group on owner/Super Admin list cards and the group detail header. Navigation and action buttons are siblings rather than nested interactive elements. The removal confirmation explicitly preserves leads, direct shares, follow-ups, source documents, and history; only the group, memberships, and group-sharing links are removed. A live disposable group/lead integration verified editing, removal of group/member/group-share rows, an unchanged lead and retained direct lead share, per-lead detachment audit plus group deletion audit, and NOT_FOUND on repeated deletion. Finally cleanup removed every temporary group, lead, share, and audit row.

Authenticated UI QA opened and cancelled all Copy/Edit/Remove dialogs without saving changes to real records. Copy pages and dialogs were contained at 320 and 390 px. Group list cards and Edit/Remove confirmations passed at 320, 390, and 1280 px with no document horizontal overflow and zero nested buttons. Group detail retained visible Edit/Remove controls at 320 px. Pending-state protections disable duplicate submits and prevent closing the affected dialog during writes.

The complete automated suite passes 139 tests across 29 files, including new copy naming, copy authorization/content/conflict, and group management authorization/validation/error coverage. TypeScript, production build, and git diff checks passed. Existing non-blocking bundle-size and pnpm configuration warnings remain. No real email was sent. Original library and group/lead records were not changed during QA, and all temporary scripts, fixtures, page captures, screenshots, and console artifacts were removed before checkpoint.


## Permanent email product/template deletion QA — 2026-10-25

Added explicit Delete product and Delete template actions without replacing Archive. A shared responsive confirmation dialog names the selected item, explains irreversible deletion and product cascade counts, preserves sent-email/tracking history, offers Archive as the reversible alternative, and initially focuses Cancel. Pending deletion disables repeat actions and dismissal. Successful deletion removes the item from the confirmed admin cache and invalidates email-library and SMTP template choices; errors retain the confirmation and show a safe message.

Both API procedures are Super Admin-only and validate positive IDs. Product deletion locks the product and its templates, removes all active/archived child templates and the product, and inserts an immutable deletion audit in one transaction. Single-template deletion locks/removes only that template and records its audit. No outbound email, communication, lead, SMTP, or global email-frame data is deleted or rewritten. Template create/update operations now lock their parent products and reject a vanished destination to prevent orphan writes while a product is deleted. Existing manual/test-send checks already reject unavailable selections.

Live disposable-fixture integration verified single-template isolation; full product cascade including archived templates; exact preservation of stored outbound message IDs, names, HTML, timestamps, and open/click counts; unrelated product/template preservation; NOT_FOUND on repeated deletes; deletion audits; complete rollback when the audit insert intentionally failed; and rejection of creation/movement into a deleted parent product. Every disposable product, template, outbound-history record, and audit row was cleaned in finally blocks. No actual email was sent and no real library item was deleted.

Authenticated read-only UI checks opened/cancelled product and template confirmations at 320, 390, and 1280 px. Pages/dialogs stayed viewport-contained with zero horizontal overflow, notices were readable, and Cancel received default keyboard focus. A final 320 px visual inspection passed after backend stabilization. All 144 tests across 30 files pass, along with TypeScript, production build, and git diff checks. Existing non-blocking bundle-size/pnpm configuration warnings remain. Temporary browser frames, screenshots, page/HTML captures, console files, and integration scripts were removed before checkpoint.


## Direct staff account management QA — 2026-10-25

Super Admin can now create a local technical-staff account directly with full name, normalized login email, a confirmed password, job title, active flag, and initial permissions. Invitations remain available independently. Every staff card exposes Edit account for identity and Change password for direct password replacement. Existing job-title/activation/permission controls remain under Save access. Staff cards use a bounded identity column and two permission columns at normal desktop widths, expanding to four on wider screens.

New admin-only API procedures use the existing scrypt password policy, reject reserved administrator and duplicate emails, validate technical-staff/local targets, and return only safe result metadata. Direct creation atomically inserts the user, credential, access, disabled SMTP profile, matching pending-invitation revocation, and a safe audit. Identity edits preserve user ID/openId and ownership/access/SMTP data; only login-email changes revoke sessions and open reset requests. Password changes atomically replace the hashed credential, clear failed-login lockouts, revoke target sessions/reset requests, and audit safe metadata without any password/hash/salt. Deactivation now revokes existing sessions and rejects invalid targets. Credential-bearing DB failures are wrapped without raw query parameters or causes; explicit conflicts and NOT_FOUND remain actionable.

Authenticated read-only UI QA opened/cancelled Create account, Edit account, and Change password at 320, 390, and 1280 px. All pages/dialogs remained viewport-contained with zero horizontal overflow and visible footer actions. Create account has an independently scrollable body, safe-area footer, blank masked password fields, confirmation matching, show/hide controls, and clean form state on cancellation. Mismatched passwords disabled creation; valid matching values enabled it without submitting. A final 320 px visual check confirmed the rendered layout.

Live disposable-fixture API/DB QA verified direct credential login, normalized unique email, exact initial permissions and inactive SMTP defaults; matching invitation revocation; preservation of a name-only session; identity edit retaining user ID/openId, group ownership, permissions and the exact SMTP row while revoking old sessions/reset tokens; password replacement rejecting the old password and accepting the new one, clearing lockout state and revoking sessions/reset links; deactivation session removal; duplicate conflict behavior; full creation rollback on an intentionally failed audit; and secret-free audit/API payloads. Cleanup finally blocks removed every temporary user, credential, permission row, SMTP profile, session, reset request, invitation, group and audit. Original staff credentials and system Super Admin credential were compared before/after and remained unchanged. No real mailbox was configured, no real staff account changed, no lead created, and no email sent.

Final checks: 157 tests across 32 files pass, TypeScript passes, production build passes, git diff checks pass. Existing non-blocking pnpm configuration and bundle-size warnings remain. QA scripts, browser frames, screenshots, page/HTML captures and console files are removed before checkpoint delivery.


## 2026-10-25 — Independent staff email access

Added shared fail-closed `manageEmails` and `useEmailTemplates` flags. Newly created direct accounts/invitations default both false. An idempotent startup transaction adds only missing keys in existing staff/invitation JSON based on their previous `manageContacts` capability, preserving explicit false and all other fields. Runtime authorization never infers email access from contacts or lead viewing. No schema migration or credential changes were needed.

Final validation passed 173 tests in 34 files, TypeScript, production build, and diff checks. Existing pnpm configuration/bundle-size notices are non-blocking. Runtime HTTP returned 200 after the managed restart; the transient startup error during implementation was corrected before QA.

Live API tests passed for all four combinations: neither flag; Emails only with contacts disabled; both flags; templates only without Emails. Checks covered own-lead recipient scoping, email history and library gates, SMTP test gates, Super Admin-only frame/CRUD denial, email-content redaction, and preservation of explicit flags during backfill. Permitted send paths stopped at disabled fixture SMTP preconditions; no SMTP connection or real delivery occurred. Unit tests additionally cover allowed mocked sends, stale templates, manual email logging and follow-up completion guards, and non-email contact preservation.

Authenticated desktop staff browser QA passed for no-email, mail-only, and fully authorized accounts. No-email staff had no Mails or lead email action/tab and direct Mails was unavailable; mail-only staff had a plain composer without template selectors and Test connection only; fully authorized staff had product/template selectors, the lead composer, and both mailbox test actions. The templates-only browser case was not completed, so its denial is supported by live API testing and client conditions rather than a completed browser interaction. Super Admin Staff/Create account controls passed at 320px with zero horizontal overflow, both new creation flags off, and footer in viewport. No Save/Send/test action was pressed on real records.

Verified cleanup removed all four disposable staff users and fake leads plus their permissions, local credentials, SMTP profiles, sessions, communications, and audit rows. Real staff credentials, leads, templates, SMTP configuration, and administrator-managed scheduled reminder delivery policy remain unchanged. Local QA scripts and main-browser captures were removed before checkpoint; no QA artifact is part of the project deliverable.


## 2026-10-26 — SMTP setup remains solely Super Admin responsibility
Removed Email settings from staff navigation and the readonly staff setup/test workspace. A shared role-only guard blocks direct staff screens without enabling settings/library queries; a render regression verifies no SMTP fields or test/save actions even with both staff email capabilities enabled. Super Admin still selects and configures/tests each staff mailbox. SMTP test APIs now reject non-administrators before any target lookup, settings/template read, or provider call; admin-selected mailbox tests ignore the target's email capability flags. Manual sending, template use, outbound history, assigned SMTP data, and reminders remain unchanged. Read-only admin browser check confirmed account selector, tests/save controls, and blank password input preserving saved credential secrecy. Final 177 tests/36 files, TypeScript, build and diff checks passed. No QA data created, no SMTP settings changed, no real email or connection test performed.


## 2026-10-26 — Leader sales workspace and staff own-sales read access
Migration 0020 adds Customers (unique existing lead link) and Sales Orders without changing existing records or credentials. Leader is an explicit default-off staff capability, not an administrator role. Super Admin assigns it; active Leaders have global operational lead visibility and sales writes, while clinical/email/export permissions and configuration remain separately protected. Promotion changes only Customer business status and creates one linked record; existing lead ownership, interest, diagnosis storage, documents, contacts, and follow-ups are preserved. A repeated promotion returns the same Customer without another audit; first confirmation of an already-Customer-status lead still records its sales linkage.

Manual orders support multiple purchases per customer, product, positive whole quantity, exact integer cents, currency, optional unique external reference or generated CF reference, status, Eastern order timestamp, notes, and credited staff. Creator attribution is immutable. Live tests verified default self credit, credit to another staff, edit/reassignment, duplicate-reference CONFLICT through wrapped Drizzle errors, invalid-owner rejection, pagination/filtering, audit rollback, and no false immutable-field audit changes. Sales audit events have null leadId and are retrieved only after a scoped order lookup; they cannot leak through ordinary lead audit. The actual mobile UI created/edited a disposable order and verified popup closure, status persistence, correct Me reassignment, creator preservation, and readable before/after audit values.

Final user policy: any active ordinary staff can read their own sales records, but only Leader/Admin can promote, create, edit, reassign, or fetch the credited-staff selector. Customer scope is a lead created/assigned to the viewer or a credited order; all list/count/detail/choice/by-lead queries apply that scope. Order scope is credited owner only, not creator. Customer detail/counts expose only that ordinary staff's orders, even when the underlying lead is theirs. Live tests verified two owned customers with scoped counts [0,1], exactly one credited order created by somebody else, no foreign order via direct ID, no bypass via owner filters, zero other-staff orders on an owned customer, and order-only customer access with canOpenLead=false and the foreign lead still denied. Leader revocation invalidates sessions and sales writes. A correlated SQL alias issue found live was fixed and covered by SQL-generation regression tests.

Browser QA verified Leader global navigation and fake records, no administrator setup navigation, promotion confirmation/cancel, clinical restriction, and responsive pages/dialogs. Final isolated staff QA verified both ordinary ownership cases: own-lead customers with only credited order/details and no write controls; customer access solely via credited order with no Open lead, no second customer, and no foreign lead. Main authenticated QA covered 320/360/390px plus 1280px desktop and a 390×440 compact viewport; mobile editor body scrolls with persistent contained footer, no document horizontal overflow, and selectors remain usable. Protected query caches are removed/cancelled during all account-changing login/logout/reset/invitation flows, with regression coverage preventing late old-account responses from repopulating them.

Final automated result: 202 tests across 42 files passed, TypeScript passed, production build passed (existing bundle-size/baseline warnings only), diff check passed, and runtime HTTP 200. Exact cleanup removed the two disposable accounts, three fake leads, two fake Customers, four successful fake Orders, sessions, credentials, SMTP settings, identity keys, memberships, and all related audits. SHA-256 fingerprints of real local/admin credentials and SMTP profiles were unchanged. Main browser captures/QA scripts were deleted. The final isolated QA worker did not confirm capture cleanup/logout before its report cutoff; its dummy sessions were subsequently deleted by exact database cleanup, and no such captures or real data were delivered or included in the project. No original staff, lead, Customer, Order, email template, or SMTP profile was changed; no real email, SMTP test, or payment was performed.


## 2026-10-26 — Super Admin/Leader staff impersonation
Migration 0021 adds a unique original-token-hash overlay table and nullable audit original-operator fields. The browser retains its original authenticated cookie; only a server-validated overlay selects the effective staff principal. Super Admin can select active staff including Leaders; a Leader can select ordinary active staff only. Every request verifies the original session, actor capability, target role/activity, actor binding, and overlay expiry (one hour at most and never beyond the original session). Start requires the authenticated original actor rather than client/context claims, rejects existing overlays/self/inactive/Leader targets, and commits overlay plus start audit atomically. Stop is available independently of target permissions; missing/revoked original sessions cannot restore elevated access. Invalid/expired overlays are removed before returning the original principal. Database lookup/deletion uncertainty fails closed, and errors/logs exclude token hashes and raw SQL.

All tRPC procedures run in request-isolated audit identity context. Existing business audit inserts retain effective target actor and append original operator ID/name; lead and order audit views label impersonated changes. Runtime metadata exposes only safe actor/target ID, name, email, and expiry. Original and target permissions are never merged. The target uses its own ownership, clinical/email/sales permissions, and assigned SMTP identity. Credentials, target failed-login state, and password hashes/salts are untouched by start/stop. Impersonation is not a password login.

Live disposable integration verified Admin→Leader, Leader→ordinary staff, ordinary/Leader/self/inactive/nested/forged denials, target-only permissions, administrator API denial, exact lead audit effective/original identities, unchanged target credentials, stop/expiry restoration, target deactivation/promotion auto-end, original-session deletion denial, and stale protected request rejection. Unit regressions also verify concurrent request audit isolation, no spoofed provenance, forged start binding, secret-free status/start/stop failures, and no privilege restoration if overlay state/deletion is uncertain.

Actual browser testing used a fake Leader and ordinary staff only. The Leader directory contained eligible staff without create/edit/password/permission controls. Confirmation opened, target-only workspace and prominent actor/target banner appeared, admin setup and staff directory were absent while impersonating, Return to my account restored the original Leader directory, and an impersonation begun in a secondary same-origin workspace refreshed the main workspace. Desktop plus 320/360/390px checks showed contained confirmation, no horizontal overflow, and a visible return action; mobile navigation shares the sticky banner wrapper rather than being covered by it. Super Admin eligibility was verified live through a disposable system session and frontend role conditions; no real Super Admin password was used or changed.

Final checks: 214 tests across 45 files, TypeScript, production build, diff check, and HTTP 200 passed (existing bundle-size warning only). Exact cleanup deleted all four fake accounts, one fake lead, associated local/SMTP profiles, cookies' database sessions, overlays, identity rows, and audit events, including the secondary browser session. Real local/system credentials and SMTP profiles had unchanged SHA-256 fingerprints. Main browser captures and scripts are removed before checkpoint. No real lead/customer/order/account credential/SMTP setting was modified; no real email, SMTP provider test, or payment occurred.
