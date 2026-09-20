ALTER TABLE `outbound_emails` ADD `trackingToken` varchar(64);--> statement-breakpoint
ALTER TABLE `outbound_emails` ADD `firstOpenedAt` bigint;--> statement-breakpoint
ALTER TABLE `outbound_emails` ADD `lastOpenedAt` bigint;--> statement-breakpoint
ALTER TABLE `outbound_emails` ADD `openCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `outbound_emails` ADD `firstClickedAt` bigint;--> statement-breakpoint
ALTER TABLE `outbound_emails` ADD `lastClickedAt` bigint;--> statement-breakpoint
ALTER TABLE `outbound_emails` ADD `clickCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `outbound_emails` ADD CONSTRAINT `outbound_emails_trackingToken_unique` UNIQUE(`trackingToken`);