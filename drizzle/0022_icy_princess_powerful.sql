ALTER TABLE `outbound_emails` MODIFY COLUMN `leadId` int;--> statement-breakpoint
ALTER TABLE `outbound_emails` ADD `ccEmails` text;--> statement-breakpoint
ALTER TABLE `outbound_emails` ADD `bccEmails` text;