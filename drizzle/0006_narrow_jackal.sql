CREATE TABLE `password_reset_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`tokenHash` varchar(64),
	`status` enum('pending','ready','used','rejected','expired') NOT NULL DEFAULT 'pending',
	`requestedAt` bigint NOT NULL,
	`preparedBy` int,
	`preparedAt` bigint,
	`expiresAt` bigint,
	`usedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `password_reset_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_requests_tokenHash_unique` UNIQUE(`tokenHash`)
);
