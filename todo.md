# CareFlow CRM Feature Tracker

## Completed update: Per-staff SMTP email accounts

| Task | Status |
| --- | --- |
| Add one `staff_smtp_settings` row per technical staff member | Completed |
| Store SMTP host, port, security mode, username, plaintext password, sender identity, enabled state, and verification metadata | Completed |
| Keep the stored password hidden from every API response and UI field | Completed |
| Build staff-owned Email settings with Save, Connection test, and Test email actions | Completed |
| Use the assigned staff member's verified SMTP account for both staff and lead reminder emails | Completed |
| Keep unconfigured reminders retryable and report missing assigned-staff SMTP clearly | Completed |
| Show SMTP readiness in Follow-ups and Super Admin Staff & access | Completed |
| Update the English System guide | Completed |
| Run migration, 84 tests, TypeScript, production build, runtime, browser QA, and database cleanup checks | Completed |
| Save the final checkpoint | Completed |

## Operational next step

Each technical staff member must enter, enable, and verify their real mailbox in **Email settings**. Automatic delivery also requires the existing 15-minute scheduled reminder processor to be activated for the deployed version.
