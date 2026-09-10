CREATE TABLE `system_admin_credentials` (
	`id` int NOT NULL,
	`identifier` varchar(320) NOT NULL,
	`name` varchar(160) NOT NULL DEFAULT 'Super Administrator',
	`passwordHash` varchar(128) NOT NULL,
	`passwordSalt` varchar(64) NOT NULL,
	`failedLoginCount` int NOT NULL DEFAULT 0,
	`lockedUntil` bigint,
	`passwordUpdatedAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_admin_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_admin_credentials_identifier_unique` UNIQUE(`identifier`)
);
--> statement-breakpoint
CREATE TABLE `system_admin_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastUsedAt` bigint NOT NULL,
	CONSTRAINT `system_admin_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_admin_sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
DELETE FROM `auth_sessions` WHERE `userId` IN (SELECT `id` FROM `users` WHERE `openId` IN ('coHjb3LurMKuYKHvEvpR3V', 'local:super-admin'));
--> statement-breakpoint
DELETE FROM `staff_permissions` WHERE `userId` IN (SELECT `id` FROM `users` WHERE `openId` IN ('coHjb3LurMKuYKHvEvpR3V', 'local:super-admin'));
--> statement-breakpoint
DELETE FROM `local_credentials` WHERE `userId` IN (SELECT `id` FROM `users` WHERE `openId` IN ('coHjb3LurMKuYKHvEvpR3V', 'local:super-admin'));
--> statement-breakpoint
DELETE FROM `users` WHERE `openId` IN ('coHjb3LurMKuYKHvEvpR3V', 'local:super-admin');
