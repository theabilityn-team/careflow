CREATE TABLE `lead_identity_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`keyType` enum('email','phone','profile') NOT NULL,
	`keyHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lead_identity_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `lead_identity_keys_keyHash_unique` UNIQUE(`keyHash`),
	CONSTRAINT `lead_identity_keys_leadId_keyType_unique` UNIQUE(`leadId`,`keyType`)
);
