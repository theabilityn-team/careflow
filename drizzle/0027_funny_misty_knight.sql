CREATE TABLE `measure_settings` (
	`id` int NOT NULL,
	`inactivityMinutes` int NOT NULL DEFAULT 40,
	`trackingSince` bigint NOT NULL,
	`updatedBy` int,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `measure_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff_activity_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventKey` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`sessionKey` varchar(64) NOT NULL,
	`impersonatedById` int,
	`kind` varchar(32) NOT NULL,
	`page` varchar(40),
	`leadId` int,
	`occurredAt` bigint NOT NULL,
	CONSTRAINT `staff_activity_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_activity_event_key_unique` UNIQUE(`eventKey`)
);
--> statement-breakpoint
CREATE INDEX `staff_activity_user_time_idx` ON `staff_activity_events` (`userId`,`occurredAt`);