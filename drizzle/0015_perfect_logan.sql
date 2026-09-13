ALTER TABLE `email_templates` MODIFY COLUMN `headerHtml` mediumtext NOT NULL;--> statement-breakpoint
ALTER TABLE `email_templates` MODIFY COLUMN `footerHtml` mediumtext NOT NULL;--> statement-breakpoint
ALTER TABLE `outbound_emails` MODIFY COLUMN `bodyHtml` mediumtext NOT NULL;