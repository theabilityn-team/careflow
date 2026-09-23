# CareFlow CRM Feature Tracker

## Completed update: Central SMTP management and Mails workspace

| Task | Status |
| --- | --- |
| Add a dedicated Super Admin SMTP profile | Completed |
| Let Super Admin select and edit SMTP settings for every staff account | Completed |
| Restrict technical staff to assigned email, active/verified status, and test actions | Completed |
| Keep SMTP host, username, password, sender identity, and reply-to hidden from staff APIs and UI | Completed |
| Use the Super Admin mailbox for administrator-owned automatic reminders | Completed |
| Add access-scoped lead email composition through the logged-in account's verified SMTP | Completed |
| Add per-account predefined and editable sanitized HTML header/footer | Completed |
| Add sent/failed outbound email history and successful lead Communication entries | Completed |
| Add a prominent notice that received email requires direct mailbox login | Completed |
| Add database migrations for email templates and outbound history | Completed |
| Run authorization, HTML safety, delivery, regression, build, runtime, database, browser, and cleanup checks | Completed |
| Save the final checkpoint | Completed |

## Operational next step

Super Admin must configure, enable, and verify the real administrator and staff SMTP profiles under **Email settings**. No real email is sent until a profile is complete and verified. CareFlow records outbound mail only; staff must sign in directly to the assigned mailbox to read received messages.


## Completed update: Hospital Facesheet OCR support

| Task | Status |
| --- | --- |
| Add **Hospital Facesheet — standard layout** document type | Completed |
| Add **Hospital Facesheet — extended layout** document type | Completed |
| Extend structured OCR for encounter, demographics, contacts, guarantor, insurance, providers, diagnoses, procedures, and ICD codes | Completed |
| Keep patient phone/address/email separate from contact, guarantor, insurer, provider, and facility values | Completed |
| Exclude Social Security numbers and mother's maiden names | Completed |
| Add editable Facesheet review sections to single and bulk image intake | Completed |
| Save reviewed Facesheet fields in protected structured additional information | Completed |
| Show the Facesheet layout on review and lead classification screens | Completed |
| Update the English System guide | Completed |
| Validate both supplied examples directly with the production OCR model | Completed |
| Complete a non-saving browser scan of the standard layout | Completed |
| Run 99 tests, TypeScript, production build, runtime, log, and cleanup checks | Completed |
| Save the final checkpoint | Completed |

## Hospital Facesheet review caveats

The supplied images are photographs of a screen and contain visible moiré, so staff must review every extracted character. The first example includes a handwritten diagnosis and placeholder/unknown address values; CareFlow now extracts the legible handwritten diagnosis and displays a warning. The second example contains a non-Oncology/non-Hematology diagnosis, so CareFlow intentionally leaves the required diagnosis group unselected rather than misclassifying it; staff must choose one of the currently supported business groups before saving.


## Completed update: Product-based email template library

| Task | Status |
| --- | --- |
| Add reusable email products and message templates | Completed |
| Let Super Admin create, edit, activate, and archive products | Completed |
| Let Super Admin create, edit, activate, and archive templates per product | Completed |
| Restrict management APIs and navigation to Super Admin | Completed |
| Show only active products and templates to staff with Manage communications access | Completed |
| Fill editable subject and message fields when staff selects a template | Completed |
| Reject stale or archived template selections before SMTP delivery | Completed |
| Preserve selected product and template names in immutable sent-email history | Completed |
| Keep freeform email composition available without a template | Completed |
| Update the English System guide | Completed |
| Apply migration 0016 and verify the live database structure | Completed |
| Run unit, authorization, browser, cleanup, runtime, TypeScript, and production build checks | Completed |
| Save the final checkpoint | Completed |


## Completed update: Uploaded HTML templates and explicit SMTP test recipients

| Task | Status |
| --- | --- |
| Add Plain text / HTML format to reusable product templates | Completed |
| Let Super Admin attach `.html` / `.htm` files up to 250 KB | Completed |
| Store the sanitized HTML source, source filename, and generated text fallback | Completed |
| Remove scripts, document head metadata, forms, event handlers, embedded objects, and unsupported styles | Completed |
| Add sandboxed HTML preview and source editing to Super Admin template management | Completed |
| Let staff select, preview, and edit approved HTML drafts in Mails | Completed |
| Sanitize edited HTML again immediately before SMTP delivery | Completed |
| Require an active approved HTML template before HTML sending | Completed |
| Replace the fixed SMTP test message with required recipient, product, and template selection | Completed |
| Support both plain-text and HTML templates in Send test email | Completed |
| Apply migration 0017 and verify the live database columns | Completed |
| Preserve existing MB Aura Vortex K-1 and BOGO Deal records | Completed |
| Run 110 tests, TypeScript, production build, browser QA, runtime/log checks, and complete QA cleanup | Completed |
| Save the final checkpoint | Completed |


## Completed update: Super Admin-only global email header and footer

| Task | Status |
| --- | --- |
| Remove Header & footer from the technical-staff Mails tabs | Completed |
| Stop technical-staff browsers from loading frame HTML | Completed |
| Return HTTP 403 when staff directly calls the frame read or save API | Completed |
| Keep one global header/footer editor for Super Admin | Completed |
| Apply the Super Admin global frame to manual staff email and SMTP test email | Completed |
| Update Compose, template editor, and System guide wording | Completed |
| Verify staff and Super Admin views in the browser without changing frame data | Completed |
| Remove temporary staff QA user, session, scripts, and browser artifacts | Completed |
| Run 111 tests, TypeScript, production build, runtime/log, and repository checks | Completed |
| Save the final checkpoint | Completed |


## Completed update: Project-wide Eastern Time and independent follow-ups

| Task | Status |
| --- | --- |
| Standardize all business date/time display on `America/New_York` | Completed |
| Interpret every follow-up `datetime-local` input as Eastern Time regardless of device location | Completed |
| Make calendar day grouping and date-range queries DST-safe in Eastern Time | Completed |
| Format automatic staff and lead reminder copy in Eastern Time | Completed |
| Update lead exports and created-date filters to Eastern Time | Completed |
| Preserve multiple active follow-ups per lead instead of replacing an existing reminder | Completed |
| Derive lead Next follow-up from the earliest active reminder | Completed |
| Add per-follow-up Complete, Edit, and Delete actions | Completed |
| Preserve exact completion linkage and audit edit/delete actions | Completed |
| Restore and link both existing uncompleted follow-up schedules | Completed |
| Apply migration 0018 and verify live columns, indexes, pointers, and source links | Completed |
| Update the English System guide | Completed |
| Run 112 tests, TypeScript, production build, runtime/log, browser, and database checks | Completed |
| Push the completed project to `theabilityn-team/careflow` | Completed |
| Save the final checkpoint | Completed |


## Completed update: Direct lead email and shared lead email history

| Task | Status |
| --- | --- |
| Add **Send email** beside Edit lead and Contact & follow-up | Completed |
| Reuse active product and approved plain-text/HTML template selection on each lead | Completed |
| Keep subject/message editable and preserve HTML preview/source controls | Completed |
| Send through the logged-in account's verified SMTP profile | Completed |
| Rename Log contact to **Contact & follow-up** across the active interface and guide | Completed |
| Add an **Emails** tab with exact sent, failed, and total attempt counts | Completed |
| Show lead email history across all staff senders, not only the current user | Completed |
| Show sender, recipient, product, template, status, Eastern timestamp, and stored message preview | Completed |
| Enforce lead access before history or message retrieval and hide SMTP diagnostics from staff | Completed |
| Run 115 tests, TypeScript, production build, browser QA, runtime, DB-mutation, privacy, and cleanup checks | Completed |
| Save the final checkpoint and push to GitHub | Completed |


## Completed update: Email open and click tracking

| Task | Status |
| --- | --- |
| Add privacy-minimized open/click fields and a unique opaque tracking token | Completed |
| Add no-cookie public tracking pixel and signed click redirect endpoints | Completed |
| Instrument newly sent manual lead emails and automatic lead reminders | Completed |
| Leave internal staff reminder emails untracked | Completed |
| Convert safe web URLs in plain-text messages into trackable links | Completed |
| Keep stored email previews free of tracking markup | Completed |
| Hide tracking tokens from staff and Super Admin APIs | Completed |
| Show aggregate open/click counts in Mails and each lead's Emails tab | Completed |
| Show first/latest event timestamps in Eastern Time | Completed |
| Label pre-feature messages as tracking unavailable instead of not opened | Completed |
| Explain image blocking, privacy protection, and security-scanner limitations | Completed |
| Store no recipient IP address, device, user-agent, or browser fingerprint | Completed |
| Apply migration 0019 and verify the live schema/index | Completed |
| Run 118 tests, TypeScript, production build, endpoint, browser, database, privacy, runtime, and cleanup checks | Completed |
| Save the final checkpoint and push to GitHub | Completed |


## Completed update: Visible HTML template editor

| Task | Status |
| --- | --- |
| Replace the hidden format dropdown with visible Plain text and HTML email choices | Completed |
| Keep Upload HTML visible for both new and existing templates | Completed |
| Accept `.html` and `.htm` files up to 250 KB | Completed |
| Expose direct HTML source editing and sandboxed preview | Completed |
| Detect pasted HTML and switch automatically without losing markup | Completed |
| Preserve server-side HTML sanitization and text fallback generation | Completed |
| Verify the existing BOGO template without saving or modifying real data | Completed |
| Run 119 tests, TypeScript validation, production build, browser QA, and runtime checks | Completed |
| Save the checkpoint and push to GitHub | Completed |


## Completed update: Send test from Email templates

| Task | Status |
| --- | --- |
| Add Send test beside Edit and Archive on every active template | Completed |
| Keep the chosen template fixed in the test dialog | Completed |
| Let Super Admin choose the SMTP sender account | Completed |
| Require an explicit recipient email address | Completed |
| Prevent disabled or inactive SMTP accounts from being selected | Completed |
| Reuse the existing sanitized HTML/plain-text test-delivery backend | Completed |
| Verify the flow without sending a real message or changing data | Completed |
| Run 120 tests, TypeScript validation, production build, browser QA, and runtime audit | Completed |
| Save the checkpoint and push to GitHub | Completed |


## Completed update: Responsive email template editor — 2026-09-23

| Requirement | Status |
|---|---|
| Replace the narrow single-column editor with a dedicated responsive modal | Completed |
| Use a wide two-zone desktop workspace up to 94vw / 1,480 px | Completed |
| Use a full-width 96dvh bottom sheet on phones | Completed |
| Keep modal header and Cancel/Save actions visible | Completed |
| Constrain long HTML source to internal scrolling | Completed |
| Stack all controls safely on phone without page-level horizontal overflow | Completed |
| Verify at 1440 × 1000 and 390 × 844 | Completed |
| Run 121 tests, TypeScript, and production build | Completed |
| Remove all temporary QA routes, scripts, and artifacts | Completed |
| Save checkpoint and push GitHub | Completed |


## Completed update: Global header/footer code and live preview — 2026-09-23

| Requirement | Status |
|---|---|
| Show separate editable HTML code panels for the global header and footer | Completed |
| Add Copy HTML actions for both sections | Completed |
| Show a complete header + sample content + footer recipient preview | Completed |
| Generate preview with the same server sanitization and composition as real email | Completed |
| Refresh the preview from unsaved code without sending email | Completed |
| Keep frame management Super Admin-only | Completed |
| Add phone HTML code / Live preview view switching | Completed |
| Remove Mails tab overflow at 390 px phone width | Completed |
| Verify no database or SMTP changes during browser QA | Completed |
| Run 122 tests, TypeScript, production build, runtime, and cleanup checks | Completed |
| Save checkpoint and push GitHub | Completed |
