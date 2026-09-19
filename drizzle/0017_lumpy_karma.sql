ALTER TABLE `email_message_templates` ADD `contentMode` enum('plain','html') DEFAULT 'plain' NOT NULL;--> statement-breakpoint
ALTER TABLE `email_message_templates` ADD `bodyHtml` mediumtext;--> statement-breakpoint
ALTER TABLE `email_message_templates` ADD `sourceFileName` varchar(255);