CREATE TABLE `audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int,
	`actorId` int NOT NULL,
	`action` varchar(120) NOT NULL,
	`detail` text,
	`occurredAt` bigint NOT NULL,
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `communications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`method` enum('phone','email','sms','in_person','other') NOT NULL,
	`direction` enum('outbound','inbound') NOT NULL DEFAULT 'outbound',
	`outcome` varchar(160) NOT NULL,
	`notes` text,
	`contactedAt` bigint NOT NULL,
	`nextFollowUpAt` bigint,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `communications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lead_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`fileKey` text NOT NULL,
	`fileUrl` text NOT NULL,
	`uploadedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lead_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`firstName` varchar(120) NOT NULL,
	`lastName` varchar(120) NOT NULL,
	`email` varchar(320),
	`phone` varchar(80),
	`dateOfBirth` varchar(80),
	`address` text,
	`city` varchar(120),
	`stateProvince` varchar(120),
	`postalCode` varchar(40),
	`country` varchar(120),
	`diagnosis` text,
	`clinicalNotes` text,
	`additionalInformation` text,
	`status` enum('new','pending_review','verified','to_contact','contacted','follow_up','interested','highly_interested','qualified','customer','buyer','not_interested','unable_to_reach','archived') NOT NULL DEFAULT 'new',
	`interestLevel` enum('unknown','cold','warm','hot') NOT NULL DEFAULT 'unknown',
	`assignedTo` int,
	`createdBy` int NOT NULL,
	`lastContactAt` bigint,
	`nextFollowUpAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`fullName` varchar(160) NOT NULL,
	`jobTitle` varchar(120) NOT NULL DEFAULT 'Technical Staff',
	`tokenHash` varchar(64) NOT NULL,
	`permissions` text NOT NULL,
	`status` enum('pending','accepted','revoked','expired') NOT NULL DEFAULT 'pending',
	`createdBy` int NOT NULL,
	`expiresAt` bigint NOT NULL,
	`acceptedBy` int,
	`acceptedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_invites_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `staff_permissions` (
	`userId` int NOT NULL,
	`jobTitle` varchar(120) NOT NULL DEFAULT 'Technical Staff',
	`isActive` boolean NOT NULL DEFAULT true,
	`permissions` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_permissions_userId` PRIMARY KEY(`userId`)
);
