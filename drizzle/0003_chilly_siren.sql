ALTER TABLE `audit_events` ADD `source` varchar(60) DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_events` ADD `changes` text;--> statement-breakpoint
ALTER TABLE `audit_events` ADD `snapshotBefore` text;--> statement-breakpoint
ALTER TABLE `audit_events` ADD `snapshotAfter` text;--> statement-breakpoint
INSERT INTO `audit_events` (`leadId`, `actorId`, `action`, `source`, `detail`, `changes`, `snapshotBefore`, `snapshotAfter`, `occurredAt`)
SELECT `l`.`id`, `l`.`createdBy`, 'lead.audit_baseline', 'migration', 'Detailed audit baseline established from the current lead state', NULL, NULL,
  JSON_OBJECT(
    'firstName', `l`.`firstName`, 'lastName', `l`.`lastName`, 'email', `l`.`email`, 'phone', `l`.`phone`,
    'dateOfBirth', `l`.`dateOfBirth`, 'address', `l`.`address`, 'city', `l`.`city`, 'stateProvince', `l`.`stateProvince`,
    'postalCode', `l`.`postalCode`, 'country', `l`.`country`, 'diagnosis', `l`.`diagnosis`, 'clinicalNotes', `l`.`clinicalNotes`,
    'additionalInformation', `l`.`additionalInformation`, 'status', `l`.`status`, 'interestLevel', `l`.`interestLevel`,
    'assignedTo', `l`.`assignedTo`, 'lastContactAt', `l`.`lastContactAt`, 'nextFollowUpAt', `l`.`nextFollowUpAt`
  ), UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000
FROM `leads` `l`
WHERE NOT EXISTS (
  SELECT 1 FROM `audit_events` `a`
  WHERE `a`.`leadId` = `l`.`id` AND (`a`.`snapshotAfter` IS NOT NULL OR `a`.`action` = 'lead.audit_baseline')
);
