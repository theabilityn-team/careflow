ALTER TABLE `email_message_templates` ADD `ownerUserId` int DEFAULT 30001 NOT NULL;--> statement-breakpoint
ALTER TABLE `email_message_templates` ADD CONSTRAINT `email_message_templates_product_owner_name_unique` UNIQUE(`productId`,`ownerUserId`,`name`);--> statement-breakpoint
ALTER TABLE `email_message_templates` DROP INDEX `email_message_templates_productId_name_unique`;
