CREATE TABLE `email_message_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`subject` varchar(240) NOT NULL,
	`bodyText` mediumtext NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdBy` int NOT NULL,
	`updatedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_message_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_message_templates_productId_name_unique` UNIQUE(`productId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `email_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdBy` int NOT NULL,
	`updatedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_products_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `outbound_emails` ADD `productId` int;--> statement-breakpoint
ALTER TABLE `outbound_emails` ADD `messageTemplateId` int;--> statement-breakpoint
ALTER TABLE `outbound_emails` ADD `productName` varchar(160);--> statement-breakpoint
ALTER TABLE `outbound_emails` ADD `templateName` varchar(160);--> statement-breakpoint
CREATE INDEX `email_message_templates_product_active_sort_idx` ON `email_message_templates` (`productId`,`isActive`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `email_products_active_sort_idx` ON `email_products` (`isActive`,`sortOrder`);