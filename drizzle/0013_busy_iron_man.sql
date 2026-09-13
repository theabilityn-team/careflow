CREATE TABLE `staff_smtp_settings` (
	`userId` int NOT NULL,
	`smtpHost` varchar(255) NOT NULL,
	`smtpPort` int NOT NULL,
	`smtpSecurity` enum('tls','starttls','none') NOT NULL DEFAULT 'tls',
	`smtpUsername` varchar(320) NOT NULL,
	`smtpPassword` text NOT NULL,
	`fromEmail` varchar(320) NOT NULL,
	`fromName` varchar(160) NOT NULL DEFAULT 'CareFlow',
	`replyToEmail` varchar(320),
	`isEnabled` boolean NOT NULL DEFAULT true,
	`verifiedAt` bigint,
	`lastTestedAt` bigint,
	`lastTestError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_smtp_settings_userId` PRIMARY KEY(`userId`)
);

INSERT INTO `staff_smtp_settings` (`userId`, `smtpHost`, `smtpPort`, `smtpSecurity`, `smtpUsername`, `smtpPassword`, `fromEmail`, `fromName`, `isEnabled`)
SELECT `id`, '', 587, 'starttls', COALESCE(`email`, ''), '', COALESCE(`email`, ''), COALESCE(`name`, 'CareFlow'), false
FROM `users`
WHERE `role` = 'user';
