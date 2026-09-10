CREATE TABLE `follow_up_reminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`recipientUserId` int NOT NULL,
	`scheduledFor` bigint NOT NULL,
	`remindAt` bigint NOT NULL,
	`readAt` bigint,
	`staffEmailStatus` enum('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
	`leadEmailStatus` enum('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
	`staffSentAt` bigint,
	`leadSentAt` bigint,
	`lastError` text,
	`attempts` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `follow_up_reminders_id` PRIMARY KEY(`id`),
	CONSTRAINT `follow_up_reminders_lead_recipient_time_unique` UNIQUE(`leadId`,`recipientUserId`,`scheduledFor`)
);
--> statement-breakpoint
CREATE TABLE `lead_group_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`leadId` int NOT NULL,
	`addedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lead_group_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `lead_group_members_groupId_leadId_unique` UNIQUE(`groupId`,`leadId`)
);
--> statement-breakpoint
CREATE TABLE `lead_group_shares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`sharedWithUserId` int NOT NULL,
	`sharedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lead_group_shares_id` PRIMARY KEY(`id`),
	CONSTRAINT `lead_group_shares_groupId_sharedWith_unique` UNIQUE(`groupId`,`sharedWithUserId`)
);
--> statement-breakpoint
CREATE TABLE `lead_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`ownerId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lead_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lead_shares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`sharedWithUserId` int NOT NULL,
	`sharedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lead_shares_id` PRIMARY KEY(`id`),
	CONSTRAINT `lead_shares_leadId_sharedWith_unique` UNIQUE(`leadId`,`sharedWithUserId`)
);
--> statement-breakpoint
ALTER TABLE `leads` ADD `diagnosisCategory` varchar(80);--> statement-breakpoint
ALTER TABLE `leads` ADD `stateCode` varchar(2);--> statement-breakpoint
ALTER TABLE `staff_permissions` ADD `preferredLanguage` enum('en','es') DEFAULT 'en' NOT NULL;