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


## Completed update: Application-wide mobile remediation — 2026-09-23

| Requirement | Status |
|---|---|
| Make shared buttons, icon controls, selects, tabs, dialogs, sheets, and confirmations phone-safe | Completed |
| Keep dialogs within the dynamic viewport with scrollable bodies, stacked actions, and iPhone safe areas | Completed |
| Make the mobile sidebar close after navigation and expose a clear 44 px close action | Completed |
| Keep lead-level **Send email** visible and full width on phones | Completed |
| Keep template test email in a contained mobile bottom sheet with persistent actions | Completed |
| Replace the Leads desktop table with a structured card list below the desktop breakpoint | Completed |
| Add compact mobile totals, page-size controls, and pagination | Completed |
| Repair Dashboard, Lead groups, Lead detail, Scanner, Bulk image import, Follow-ups, Mails, Email templates, Email settings, System guide, Staff, login, and password-reset layouts | Completed |
| Constrain email previews and long names, email addresses, statuses, warnings, and errors | Completed |
| Remove nested interactive controls from Bulk image import group headers | Completed |
| Verify no document-level horizontal overflow on all primary routes at 320, 360, and 390 px | Completed |
| Verify key desktop routes after shared primitive changes | Completed |
| Run 122 tests, TypeScript validation, production build, runtime, browser, and cleanup checks | Completed |
| Save checkpoint and push GitHub | Completed |


## Completed update: Email library copies and lead group management — 2026-10-25

| Requirement | Status |
|---|---|
| Add Super Admin Copy product with editable metadata and all active/archived templates | Completed |
| Copy product and templates atomically with fresh IDs, timestamps, and current actor | Completed |
| Add Copy template with full plain/HTML content and destination product selection before save | Completed |
| Suggest unique copy names within the 160-character name limit | Completed |
| Preserve originals and keep all existing sanitization and permission checks | Completed |
| Add Edit group and Remove group to manageable list cards and group detail | Completed |
| Confirm group removal, preserve leads/direct sharing/follow-ups/documents/history, and audit detachment | Completed |
| Remove group, membership, and group sharing in one transaction | Completed |
| Validate owner/Super Admin access and deny shared non-owner/anonymous management | Completed |
| Verify Copy and group management UI on 320/390px phones and desktop | Completed |
| Run 139 tests, TypeScript, production build, live transaction checks, and complete fixture cleanup | Completed |


## Completed update: Permanent email library deletion — 2026-10-25

| Requirement | Status |
|---|---|
| Add visible Delete product and Delete template alongside existing Archive/Copy/Edit actions | Completed |
| Require explicit irreversible deletion confirmation, default focus on Cancel | Completed |
| Cascade product deletion to all templates including archived entries, atomically | Completed |
| Delete a single template without affecting its product or sibling templates | Completed |
| Preserve previously sent email content, immutable names/IDs, and open/click tracking | Completed |
| Record deletion audit events and restrict API management to Super Admin | Completed |
| Lock parent products during template creation/moves to prevent deletion race orphans | Completed |
| Refresh library and SMTP template choices only after successful deletion, protect pending submissions | Completed |
| Verify 320/390px mobile and 1280px desktop controls and confirmations without deleting real library items | Completed |
| Pass 144 tests, TypeScript, production build, live transaction rollback/history/parent-guard checks | Completed |
| Remove all disposable product/template/history/audit fixtures and QA artifacts | Completed |


## Completed update: Direct Super Admin staff account management — 2026-10-25

| Requirement | Status |
|---|---|
| Create staff account directly with name, login email, password, job title, activation, and initial permissions | Completed |
| Retain optional invitation flow as a separate secondary action | Completed |
| Add Edit account for name/login email and Change password on every staff card | Completed |
| Preserve staff user ID/openId, ownership/groups/history/access, and existing SMTP settings when editing identity | Completed |
| Revoke target sessions/reset links on login-email or password change; clear password lockouts | Completed |
| Reject duplicate/reserved emails and unauthorized/nonlocal/admin targets; return no credential secrets on success or failure | Completed |
| Prepare disabled per-account SMTP defaults and safely revoke obsolete pending invitations | Completed |
| Preserve Save access controls and revoke target sessions on account deactivation | Completed |
| Provide mobile-safe scrollable forms with visible actions, password confirmation/show-hide, and pending/cancel protection | Completed |
| Update English System guide and pass 157 tests, TypeScript, production build, live account/session/rollback QA | Completed |
| Remove disposable accounts, credentials, permissions, SMTP profiles, sessions, reset requests, invitations, groups, audits, and captures | Completed |


## Completed update: Independent staff email and template permissions — 2026-10-25
- [x] Added separate **Emails** and **Use email templates** switches to staff access, direct account creation, and invitations.
- [x] New accounts and invitations default both flags off. Existing stored records receive their previous email/template capability once; explicit false remains unchanged on subsequent startup upgrades.
- [x] Emails controls Mails, manual sends, sent/lead history, email activity logging, and connection tests independently of Manage communications.
- [x] Template selection, HTML-template drafts, and staff template tests require both flags; mail-only staff retain plain-text composition.
- [x] Library management and global header/footer remain Super Admin-only. Assigned SMTP metadata remains read-only and secret-free.
- [x] Redact restricted email content in communications, audit values, and completed follow-up archive while preserving other contact/follow-up functionality.
- [x] Verify all four live API combinations, three desktop staff UI scenarios, and 320px Super Admin permission controls. No real email sent.
- [x] Pass 173 tests, TypeScript, production build, and diff checks; remove four temporary accounts/leads and all related credentials, SMTP profiles, sessions, and audits.


## Completed update: SMTP setup is Super Admin-only — 2026-10-26
Staff no longer see Email settings in navigation or SMTP setup/test controls on a direct route. Super Admin retains account selection, per-staff SMTP configuration, and all connection/test-email actions independently of the target staff's email permissions. Staff retain Mails, lead-level sending, approved-template selection, and history. Guide/permission copy now reflects this separation. Verified 177 tests, TypeScript, production build, staff-denied screen render/query gates, backend rejection before provider calls, and read-only admin UI; no records/settings changed or email sent.


## Completed update: Leader, Customers, and Orders — 2026-10-26
- [x] Super Admin assigns the default-off Leader capability in staff permissions. Active Leaders have team-wide lead visibility and Customers/Orders management, without Super Admin configuration or automatic clinical/email/export permission.
- [x] Explicit Mark as customer creates one linked Customer, retains the original lead and ownership/interest/documents/follow-ups, and audits the promotion. Repeated confirmation is idempotent; existing Customer business status does not create a duplicate.
- [x] Add manual Orders from Customer detail or Orders with product, quantity, exact-cent unit price/currency, reference, status, Eastern timestamp, credited staff, and business notes.
- [x] Credited owner can be Me or another active staff account; immutable Created by remains the actual original creator. Edits/reassignments retain order-specific before/after audit history.
- [x] Ordinary active staff have read-only own Customers/Orders. Customer ownership follows a created/assigned lead or an order credited to that staff; Orders and customer order counts/details are always scoped to credited ownership, never order creator.
- [x] Customer-only order access never unlocks a foreign lead or clinical data. Foreign customer/order IDs, forged filters, and write attempts are rejected server-side.
- [x] Responsive list cards, compact pagination, searchable filters, contained dialogs, persistent mobile save/cancel, and safe-area padding verified at 320/360/390px and desktop.
- [x] Protected caches are cancelled/removed on login, logout, invitation acceptance, and reset login to prevent cross-account data reuse.
- [x] Migration 0020, live transaction/ownership/rollback and UI tests, 202 regression tests, TypeScript, production build, and HTTP runtime verified.
- [x] All disposable accounts, leads, Customers, Orders, credentials, SMTP profiles, sessions, identity keys, and audits removed. Main QA artifacts removed; original SMTP/password fingerprints unchanged. No real email or payment sent.


## Completed update: Privilege-safe staff impersonation — 2026-10-26
- [x] Super Admin can impersonate any active staff including Leaders; active Leaders can impersonate only ordinary active staff. Self, inactive, nested, and forged source/target requests are rejected server-side.
- [x] Additive migration 0021 stores server-only original-session overlays and nullable original-operator audit provenance. No password sharing or target login-counter/credential changes.
- [x] Original cookie session, actor rights, and target activity/role are revalidated on every request; one-hour maximum never exceeds original expiry. Revoked/expired parent sessions cannot restore access.
- [x] Exact target permissions and ownership replace the actor workspace; no administrator/Leader permission union. Start is transactional with audit; stop/auto-end remove overlay before restoring identity.
- [x] Impersonate confirmation, limited Leader Staff directory, responsive persistent banner, Return to my account, and Sign out completely are implemented.
- [x] All business audit inserts preserve the effective staff actor and append original operator via isolated request context. Lead/order histories display Impersonated by.
- [x] Account cache reset, cross-workspace notifications, identity polling, and stale-workspace mutation guards prevent old-account results/actions. Uncertain overlay or deletion state fails closed; API/log errors are secret-free.
- [x] Passed 214 tests, TypeScript, production build, live policy/expiry/revocation/audit tests, actual Leader start/return/cross-workspace UI, and 320/360/390px plus desktop checks.
- [x] All four QA accounts, fake lead, sessions, overlays, credentials, SMTP defaults, and audits removed; real credential/SMTP fingerprints unchanged. No real business record or email changed.


## Completed update: Readable order staff selectors and purchase dates — 2026-10-26
- [x] Expanded desktop Add/Edit order dialog to 896px; credited-owner selector spans the full form row.
- [x] Added reusable wider staff popup with separate wrapping name/email lines, full selected identity, accessible label, and readable touch spacing. Me, other staff, and inactive current attribution are preserved.
- [x] Orders staff filter is wider with responsive grid layout and full staff identity; customer/status selectors also fill their available fields.
- [x] Added Purchased from/to and Clear dates. Filter uses orderedAt, includes the full Eastern day at both bounds, allows open bounds, resets pagination, and suppresses stale rows for invalid range.
- [x] Shared client/server calendar validation and DST-aware inclusive SQL bounds preserve existing owner/customer/status/search ACL and count/item query parity.
- [x] Verified 225 tests, TypeScript, production build, read-only live SQL/API parity for four ranges, and actual component rendering at 320/360/390px and desktop. No business records, credentials, emails, or orders were modified; in-memory QA render artifacts removed.


## Completed update: Sales deletion and systemic selector readability — 2026-10-26
- [x] Leader and Super Admin can delete Customers and individual Orders from desktop/mobile lists and customer detail; ordinary staff retain read-only sales UI/API.
- [x] Customer confirmation states the exact associated order count and cascades all orders, while original lead/status/ownership/documents/communications/follow-ups remain unchanged. Individual deletion preserves customer/siblings.
- [x] Transactional locks, server provenance, retained audit history, stale-count conflict, safe errors, and parent locking prevent partial deletion/orphan order races; leads can be promoted again.
- [x] Pending Cancel/Confirm disabled, synchronous double-click guard, no nested card buttons, inline retry errors, and list/detail cache refresh are implemented.
- [x] Shared Select defaults to full width at every breakpoint, grows vertically, wraps all option text/email, and lets popups grow within viewport. Removed local fixed numeric trigger heights; intentional currency/pager widths remain.
- [x] Stacked name/email identities in Mails, Order customer, SMTP account, and template test selectors; removed product/template truncation in lead email.
- [x] 236 tests, TypeScript, production build, >100-order live cascade/rollback/denial/preservation/re-promotion, fake-transport actual Delete success/pending/single-submit, and 320/360/390/1280px dropdown checks passed.
- [x] Disposable records and browser/render artifacts cleaned. No real customer/order/lead was deleted; no email sent.


## Completed update: Direct email and CC/BCC — 2026-10-26
- [x] Mails offers Choose lead or Enter email with optional recipient name; direct sending never creates, guesses, or links a lead, even when the address matches one.
- [x] Mails and Lead-level Send email have optional CC/BCC, comma/semicolon parsing, 20-address limits, strict CR/LF validation, and case-insensitive To → CC → BCC deduplication.
- [x] Verified assigned SMTP, active product/HTML template permission, global frame, sanitization, tracking, and sender ownership remain intact. Empty optional copies preserve normal sending.
- [x] Migration 0022 makes only outbound leadId nullable and adds nullable CC/BCC JSON storage. History distinguishes Direct email and shows permitted copy recipients.
- [x] BCC is delivered exclusively in SMTP envelope, never visible MIME headers/body/communication/audit/error strings; APIs return BCC only to the actual sender or Super Admin, including cross-staff lead history.
- [x] Responsive expanded fields, inline invalid-recipient feedback, guarded single-submit, safe draft cleanup, and fixed lead composer footer verified using real components with an entirely mocked transport.
- [x] Shared notice clarifies message-level engagement aggregates To/CC/BCC rather than identifying the opener.
- [x] 247 tests, TypeScript, production build, real database direct/linked storage + BCC privacy with mocked SMTP, and no-network MIME test passed. Temporary accounts/lead/emails/scripts/harness/captures removed; no real email sent.


## Completed update: Lead template picker and Documents permission — 2026-10-27
- [x] Product & Email template controls remain visible at the top of lead Send email; authorized users select plain/HTML templates, preview/edit, and send exact selected IDs.
- [x] Disabled Use email templates shows explicit disabled controls and Staff & access guidance rather than silently hiding the picker. Loading, retry, no-active-template, and product-switch cleanup states are handled; no permission bypass or implicit grant.
- [x] Independent Documents switch added to staff access, invitations, and direct-account defaults. New accounts default off; old stored records retain former document entitlement once from viewClinical, preserving explicit false.
- [x] API and UI require Documents plus existing clinical access for raw clinical images; turning Documents off does not remove permitted clinical text. No implicit Leader/impersonation bypass.
- [x] Denied lead payloads contain no document URLs, names, keys, or images. Stale UI Documents tab/media disappear on access change, returning to Overview.
- [x] 259 regression tests, TypeScript, production build, stored backfill coverage, fake-transport picker/send and Staff save, and 320/360/390/1280px dialog containment verified. No real emails or lead mutations; temporary harness/captures removed.


## Completed correction: Applied staff access, read-only templates, and staff deletion — 2026-10-27
- [x] Diagnosed unsaved switch state: all stored Documents flags were still true, two template flags false, and no new staff access save audit existed that day. No implicit permission grants or real staff modifications.
- [x] Permission and Active account switches now autosave with a synchronous single-submit guard, verified canonical server response, Saving/Saved status, and rollback/error feedback. Job title retains an explicit Save job title action.
- [x] Staff access refreshes on focus, a five-second poll and same-origin access events; changed permissions cancel/reset old protected queries including source documents and template drafts.
- [x] Active staff with Emails + Use email templates now have a read-only approved Email templates navigation/route and sandboxed preview. Admin library editing/testing and SMTP setup remain protected.
- [x] Super Admin-only Delete staff uses a tombstone to hide the account, revoke login/session/reset/impersonation/SMTP access, and release its email while preserving identity and all lead/customer/order/group/audit attribution.
- [x] Reviewed/applied additive migration 0023. Live actual Admin switch saves persisted Documents off/Templates on; a separate real staff login confirmed hidden documents and working product/HTML template selection/library.
- [x] Actual 320px Delete confirmation/cancel/pending/success passed on one fake account; complete lead/document/customer/order rows remained identical and unrelated credential fingerprints unchanged.
- [x] 278 tests across 59 files, TypeScript, production build, diff and HTTP checks passed. All disposable accounts/records/sessions/audits/scripts/captures removed; no real email or business mutation.


## Completed update: Default and private personal email templates — 2026-10-28
- [x] Reviewed/applied migration 0024: existing templates remain Super Admin defaults; per-product/owner/name uniqueness permits different staff to use the same name.
- [x] Staff with existing Emails + Use email templates create unlimited personal templates per active product; defaults are read-only and no permissions are silently granted.
- [x] Default templates / My templates workspace supports personal plain text/HTML upload, preview, Copy to my templates, own edit/archive/activate and Delete my template with confirmation.
- [x] Staff and Leaders see only defaults plus their own templates in library, Mails, and lead Send email. Foreign/private IDs and default edit/delete attempts are rejected server-side; impersonation uses effective staff ownership.
- [x] Super Admin retains catalog/default management and oversight, preserves ownership on updates, and product copies exclude personal staff templates. Sent snapshots/history are not deleted or changed.
- [x] Visible tracking/referral URL notice in both libraries, template editor, Mails and lead composer; no automatic removal/rewrite of original URL parameters.
- [x] Actual two-account staff/Leader UI, single-submit Copy, own Edit, cancelled/confirmed Delete, scoped Mails picker, 320/360/390px and settled desktop modal/footer verified.
- [x] Live foreign-ID/forged-send/owner-name/HTML-referral tests passed; all temporary users/templates/catalog/session/audit records removed and real credential/SMTP fingerprints unchanged. No real email sent.
- [x] 283 tests across 59 files, TypeScript, production build and diff checks passed; no temporary QA source added to the project.


## Completed update: Staff and Admin template test recipients — 2026-10-29
- [x] Staff Email templates now offers Send test for both active defaults and own personal templates; archived templates cannot be tested.
- [x] Shared responsive test dialog has an explicit Recipient email textbox, one-address validation, Enter-to-send, selected template context, blank-on-open/reset-on-close behavior, and locked pending controls.
- [x] Staff use only the effective account's enabled/configured/verified SMTP sender without setup access or sender switching. Admin keeps sender selection and can test active default/personal templates.
- [x] New strictly validated emailLibrary.sendTestEmail checks both existing email permissions, active account, owner/default scope, active product/template and SMTP readiness; blocks foreign IDs/Leader bypass, CRLF and forged sender fields.
- [x] Saved sanitized plain/HTML content, sample Test Recipient tokens and global frame are used without creating/changing leads or verification state. Failure messages stay secret-free.
- [x] Synchronous submit guards prevent duplicate sends; Admin sender refresh failure no longer misreports successful delivery as a send failure.
- [x] 300 tests across 61 files, TypeScript and production build passed; fake-transport actual UI checks covered staff defaults/personal, Admin recipient/sender, validation, error/retry, double-submit, and 320/360/390/1280px popup containment.
- [x] No real emails, credentials or business data were changed during QA; temporary UI harness and captures removed before checkpoint.


## Implemented: Durable Manus/Drive System sync — 2026-10-29
- [x] Validated server-side Manus API credentials and existing Drive connector using read-only calls; no paid task created.
- [x] Reviewed/applied additive migration 0025 for settings/folders/items/jobs/events; all new tables are empty after QA and existing business data unchanged.
- [x] Super Admin-only System sync menu/page: Check folders, per-folder Sync/Pause/Resume/Retry, paginated item outcomes, automatic read-only progress polling, task inspection/links/credit report and deploy/worker readiness.
- [x] Approved root only; numbered Images directories and supported <=25 MB JPEG/PNG/WebP, original bytes/checksum and file-ID fingerprint inventory. Other folders/shortcuts excluded; Drive source files never moved/deleted.
- [x] SQL reservations/leases and bounded parallel Manus transfer batches survive page closure, protect replay/concurrent OCR, preserve completed items and block unknown paid dispatch from automatic retry.
- [x] Raw authenticated job-scoped callbacks, expiry/pause guards, RSA webhook verifier, and owner-authenticated platform heartbeat handler; keys/tokens/raw OCR/storage URLs absent from Admin status projections.
- [x] Full-quality shared OCR plus atomic identity keys create only complete/confident Verified leads attributed to Super Admin. Same full name/DOB attaches another document without overwriting existing lead fields; ambiguous/colliding/changed imported files go to Needs review.
- [x] 324 tests passed (one opt-in credential test skipped in normal suite), TypeScript, production build, HTTP health, live disposable verified/attachment/replay/pause transaction and 320/360/390/1280px fake-transport UI passed. All QA records/artifacts removed.
- [x] Sync-capable version published; both approved production domains return the correct callback challenge. Persisted enabled settings, registered owner heartbeat a7cVgTUwUwfn8taxSmC4ny every two minutes, and registered the signed provider webhook. Existing discovery job #4 is returning real folder/item metadata; no duplicate paid task was launched by the diagnosis.
- [x] Check folders saves unsaved/changed setup first, separates configured state from key/Drive/callback readiness, and has synchronous single-submit protection and accurate failure messages. 334 tests and exact final TypeScript/build passed.
- [x] Completed real inventory contains the ten numbered source folders. Sync now shows an inventory/unknown-dispatch blocking reason and disabled CTA rather than inviting a doomed request. Parallel unrelated imports remain supported.
- [x] Retired/paused the skipped cron; authenticated completion and signed task events advance bounded SQL work. Ready requires the deployed native callback protocol, not merely a registered schedule/webhook. Fully failed batches pause automatically to prevent recurring paid failure.
- [x] Native Drive binary download is cwd-bound: relative output in an explicit private work directory verified exact 9,222,068 original bytes and MD5. Updated prompts and safe download/upload stage diagnostics. Initial transfer batches are limited to one image until a persisted OCR/import outcome proves the pipeline; configured limits then apply. 355 tests, TypeScript, production build and diff checks pass.
- [x] User-published native-events-v2 health marker confirmed live. Hardened storage with explicit node:crypto UUID, 15-second presign / 60-second upload deadlines, secret-free stage/code/HTTP failures and safe sync event evidence. 365 tests, TypeScript and production build pass; no schema/UI change or new paid task.
- [x] Isolated large binary production ingress failure: an 8-byte anonymous request returned 401, while a 9 MB anonymous request timed out; direct 9 MB storage upload succeeded. Replaced sync image delivery with scoped signed storage PUT plus small JSON callbacks, reusing existing source validation, scanner and Verified import. Direct-v3 deployed health is required before paid dispatch. No new schema/UI.
- [x] Real original Drive image #4 completed through the corrected preview backend: signed grant 200, direct PUT 200, scanner/import callback 200 imported, persisted final image/extraction/Verified lead/document/Super Admin audit. Final stored 9,222,068 bytes and MD5 match the original; canonical document is not the mutable staging object. Zero new Manus tasks; private source bytes removed and folder paused. 386 tests, TypeScript and production build pass.
- [x] Published direct-storage-v3 confirmed. User-authorized one-item task #16 exposed exact generated-worker bugs: wrong manifest field names/types and JSON encoding of binary PUT; prior tasks also hit production 403 with default Python urllib User-Agent. Replaced improvised scripts with one served/tested fixed Python worker, exact numeric id/driveFileId contract, raw bytes, explicit CareFlow-Sync UA, bounded retries/cleanup and fixed script prompt/config. Worker-v4 deployed health gates future paid dispatch.
- [x] Fixed worker executed against LIVE production endpoints with real Drive item #5: upload/OCR persisted and valid Needs review outcome, no guessed lead. Job #18 completed, source bytes removed, folder paused, zero new Manus tasks in fixed-worker proof. Current counts: 1 imported, 1 needs_review, 5,184 pending. 392 tests pass, TypeScript/build/diff pass. Existing legitimate lead/review items retained.
- [ ] Deploy fixed-worker-v4 and confirm live script/version/readiness before resuming folder 01. Images. No additional paid tasks until the deterministic worker version is live; no mass readiness claim from preview alone.
