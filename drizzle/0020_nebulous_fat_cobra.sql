CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`customerSince` bigint NOT NULL,
	`notes` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_leadId_unique` UNIQUE(`leadId`)
);
--> statement-breakpoint
CREATE TABLE `sales_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`externalReference` varchar(80),
	`productName` varchar(160) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unitPriceCents` bigint NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`status` enum('pending','paid','fulfilled','cancelled','refunded') NOT NULL DEFAULT 'paid',
	`orderedAt` bigint NOT NULL,
	`ownerUserId` int NOT NULL,
	`ownerName` varchar(160) NOT NULL,
	`createdBy` int NOT NULL,
	`createdByName` varchar(160) NOT NULL,
	`updatedBy` int NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `sales_orders_externalReference_unique` UNIQUE(`externalReference`)
);
--> statement-breakpoint
CREATE INDEX `customers_customerSince_idx` ON `customers` (`customerSince`);--> statement-breakpoint
CREATE INDEX `sales_orders_customer_date_idx` ON `sales_orders` (`customerId`,`orderedAt`);--> statement-breakpoint
CREATE INDEX `sales_orders_owner_date_idx` ON `sales_orders` (`ownerUserId`,`orderedAt`);--> statement-breakpoint
CREATE INDEX `sales_orders_status_date_idx` ON `sales_orders` (`status`,`orderedAt`);