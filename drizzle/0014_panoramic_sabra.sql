CREATE TABLE `email_templates` (
	`userId` int NOT NULL,
	`headerHtml` text NOT NULL,
	`footerHtml` text NOT NULL,
	`updatedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_templates_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `outbound_emails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`senderUserId` int NOT NULL,
	`leadId` int NOT NULL,
	`recipientEmail` varchar(320) NOT NULL,
	`recipientName` varchar(241) NOT NULL,
	`fromEmail` varchar(320) NOT NULL,
	`subject` varchar(240) NOT NULL,
	`bodyHtml` text NOT NULL,
	`status` enum('sent','failed') NOT NULL,
	`providerMessageId` varchar(255),
	`error` text,
	`sentAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outbound_emails_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `outbound_emails_senderUserId_sentAt_idx` ON `outbound_emails` (`senderUserId`,`sentAt`);--> statement-breakpoint
CREATE INDEX `outbound_emails_leadId_sentAt_idx` ON `outbound_emails` (`leadId`,`sentAt`);