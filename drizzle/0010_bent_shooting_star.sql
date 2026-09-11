CREATE TABLE `completed_follow_ups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`communicationId` int NOT NULL,
	`completedBy` int NOT NULL,
	`scheduledFor` bigint NOT NULL,
	`completedAt` bigint NOT NULL,
	`method` enum('phone','email','sms','in_person','other') NOT NULL,
	`outcome` varchar(160) NOT NULL,
	`notes` text,
	`nextFollowUpAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `completed_follow_ups_id` PRIMARY KEY(`id`),
	CONSTRAINT `completed_follow_ups_communicationId_unique` UNIQUE(`communicationId`)
);
