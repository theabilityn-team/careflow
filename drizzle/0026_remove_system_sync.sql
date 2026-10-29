-- System sync has been retired. Clear only its dedicated state.
-- Empty legacy tables remain physically present; no destructive DDL is applied
-- without separate confirmation. They have no application schema/API/worker.
DELETE FROM `system_sync_events`;--> statement-breakpoint
DELETE FROM `system_sync_items`;--> statement-breakpoint
DELETE FROM `system_sync_jobs`;--> statement-breakpoint
DELETE FROM `system_sync_folders`;--> statement-breakpoint
DELETE FROM `system_sync_settings`;
