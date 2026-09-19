ALTER TABLE `completed_follow_ups` ADD `followUpId` int;--> statement-breakpoint
ALTER TABLE `follow_up_reminders` ADD `sourceCommunicationId` int;--> statement-breakpoint
ALTER TABLE `follow_up_reminders` ADD `createdBy` int DEFAULT -1000000 NOT NULL;--> statement-breakpoint
UPDATE `follow_up_reminders` r
LEFT JOIN (
  SELECT c.`leadId`, c.`nextFollowUpAt`, MAX(c.`id`) AS `communicationId`
  FROM `communications` c
  LEFT JOIN `completed_follow_ups` f
    ON f.`leadId` = c.`leadId` AND f.`scheduledFor` = c.`nextFollowUpAt`
  WHERE c.`nextFollowUpAt` IS NOT NULL AND f.`id` IS NULL
  GROUP BY c.`leadId`, c.`nextFollowUpAt`
) candidate ON candidate.`leadId` = r.`leadId` AND candidate.`nextFollowUpAt` = r.`scheduledFor`
LEFT JOIN `communications` source ON source.`id` = candidate.`communicationId`
SET r.`sourceCommunicationId` = source.`id`, r.`createdBy` = COALESCE(source.`createdBy`, -1000000);--> statement-breakpoint
INSERT INTO `follow_up_reminders`
  (`leadId`, `sourceCommunicationId`, `recipientUserId`, `createdBy`, `scheduledFor`, `remindAt`, `staffEmailStatus`, `leadEmailStatus`)
SELECT source.`leadId`, source.`id`,
  COALESCE(l.`assignedTo`, CASE WHEN l.`createdBy` > 0 THEN l.`createdBy` ELSE -1000000 END),
  source.`createdBy`, source.`nextFollowUpAt`, source.`nextFollowUpAt` - 7200000,
  'pending', CASE WHEN l.`email` IS NULL OR TRIM(l.`email`) = '' THEN 'skipped' ELSE 'pending' END
FROM (
  SELECT c.`leadId`, c.`nextFollowUpAt`, MAX(c.`id`) AS `id`
  FROM `communications` c
  INNER JOIN `leads` active_lead ON active_lead.`id` = c.`leadId` AND active_lead.`nextFollowUpAt` IS NOT NULL
  LEFT JOIN `completed_follow_ups` f
    ON f.`leadId` = c.`leadId` AND f.`scheduledFor` = c.`nextFollowUpAt`
  WHERE c.`nextFollowUpAt` IS NOT NULL AND f.`id` IS NULL
  GROUP BY c.`leadId`, c.`nextFollowUpAt`
) candidate
INNER JOIN `communications` source ON source.`id` = candidate.`id`
INNER JOIN `leads` l ON l.`id` = source.`leadId`
LEFT JOIN `follow_up_reminders` existing
  ON existing.`leadId` = source.`leadId` AND existing.`scheduledFor` = source.`nextFollowUpAt`
WHERE existing.`id` IS NULL;--> statement-breakpoint
UPDATE `leads` l
SET l.`nextFollowUpAt` = (
  SELECT MIN(r.`scheduledFor`) FROM `follow_up_reminders` r WHERE r.`leadId` = l.`id`
)
WHERE EXISTS (SELECT 1 FROM `follow_up_reminders` r WHERE r.`leadId` = l.`id`);--> statement-breakpoint
ALTER TABLE `completed_follow_ups` ADD CONSTRAINT `completed_follow_ups_followUpId_unique` UNIQUE(`followUpId`);--> statement-breakpoint
ALTER TABLE `follow_up_reminders` ADD CONSTRAINT `follow_up_reminders_sourceCommunicationId_unique` UNIQUE(`sourceCommunicationId`);--> statement-breakpoint
CREATE INDEX `follow_up_reminders_recipientUserId_scheduledFor_idx` ON `follow_up_reminders` (`recipientUserId`,`scheduledFor`);--> statement-breakpoint
CREATE INDEX `follow_up_reminders_leadId_scheduledFor_idx` ON `follow_up_reminders` (`leadId`,`scheduledFor`);
