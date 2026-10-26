CREATE TABLE `impersonation_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`originTokenHash` varchar(64) NOT NULL,
	`actorUserId` int NOT NULL,
	`targetUserId` int NOT NULL,
	`expiresAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `impersonation_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `impersonation_sessions_originTokenHash_unique` UNIQUE(`originTokenHash`)
);
--> statement-breakpoint
ALTER TABLE `audit_events` ADD `impersonatedById` int;--> statement-breakpoint
ALTER TABLE `audit_events` ADD `impersonatedByName` varchar(160);--> statement-breakpoint
CREATE INDEX `impersonation_actor_idx` ON `impersonation_sessions` (`actorUserId`);--> statement-breakpoint
CREATE INDEX `impersonation_target_idx` ON `impersonation_sessions` (`targetUserId`);--> statement-breakpoint
CREATE INDEX `impersonation_expiry_idx` ON `impersonation_sessions` (`expiresAt`);