CREATE TABLE `system_sync_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`folderId` int,
	`itemId` int,
	`jobId` int,
	`type` varchar(50) NOT NULL,
	`message` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_sync_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_sync_folders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driveFolderId` varchar(100) NOT NULL,
	`name` varchar(255) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`status` varchar(32) NOT NULL DEFAULT 'not_checked',
	`desiredState` varchar(16) NOT NULL DEFAULT 'idle',
	`lastCheckedAt` bigint,
	`lastStartedAt` bigint,
	`lastCompletedAt` bigint,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_sync_folders_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_sync_folders_driveFolderId_unique` UNIQUE(`driveFolderId`)
);
--> statement-breakpoint
CREATE TABLE `system_sync_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driveFileId` varchar(100) NOT NULL,
	`folderId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`byteSize` bigint,
	`checksum` varchar(80),
	`modifiedTime` varchar(80),
	`sourcePath` text,
	`fingerprint` varchar(64) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`leadId` int,
	`documentId` int,
	`jobId` int,
	`attempts` int NOT NULL DEFAULT 0,
	`leaseUntil` bigint,
	`uploadedFileKey` text,
	`uploadedFileUrl` text,
	`extractionJson` mediumtext,
	`lastError` text,
	`completedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_sync_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_sync_items_driveFileId_unique` UNIQUE(`driveFileId`)
);
--> statement-breakpoint
CREATE TABLE `system_sync_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` varchar(20) NOT NULL,
	`folderId` int,
	`status` varchar(32) NOT NULL DEFAULT 'created',
	`manusTaskId` varchar(160),
	`manusTaskUrl` text,
	`callbackTokenHash` varchar(64) NOT NULL,
	`expiresAt` bigint NOT NULL,
	`itemIds` mediumtext,
	`lastActivityAt` bigint NOT NULL,
	`lastError` text,
	`creditsUsed` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_sync_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_sync_settings` (
	`id` int NOT NULL,
	`rootFolderId` varchar(100) NOT NULL,
	`connectorId` varchar(100) NOT NULL,
	`publicBaseUrl` varchar(500),
	`enabled` boolean NOT NULL DEFAULT false,
	`maxParallel` int NOT NULL DEFAULT 3,
	`batchSize` int NOT NULL DEFAULT 50,
	`scheduleTaskUid` varchar(65),
	`lastCheckedAt` bigint,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_sync_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `system_sync_items_folderId_idx` ON `system_sync_items` (`folderId`);--> statement-breakpoint
CREATE INDEX `system_sync_items_jobId_idx` ON `system_sync_items` (`jobId`);--> statement-breakpoint
CREATE INDEX `system_sync_settings_scheduleTaskUid_idx` ON `system_sync_settings` (`scheduleTaskUid`);