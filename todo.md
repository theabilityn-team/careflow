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
