import {
  bigint,
  boolean,
  int,
  index,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const localCredentials = mysqlTable("local_credentials", {
  userId: int("userId").primaryKey(),
  identifier: varchar("identifier", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 128 }).notNull(),
  passwordSalt: varchar("passwordSalt", { length: 64 }).notNull(),
  failedLoginCount: int("failedLoginCount").default(0).notNull(),
  lockedUntil: bigint("lockedUntil", { mode: "number" }),
  passwordUpdatedAt: bigint("passwordUpdatedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const authSessions = mysqlTable("auth_sessions", {
  id: int("id").autoincrement().primaryKey(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  userId: int("userId").notNull(),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastUsedAt: bigint("lastUsedAt", { mode: "number" }).notNull(),
});

export const systemAdminCredentials = mysqlTable("system_admin_credentials", {
  id: int("id").primaryKey(),
  identifier: varchar("identifier", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 160 }).default("Super Administrator").notNull(),
  passwordHash: varchar("passwordHash", { length: 128 }).notNull(),
  passwordSalt: varchar("passwordSalt", { length: 64 }).notNull(),
  failedLoginCount: int("failedLoginCount").default(0).notNull(),
  lockedUntil: bigint("lockedUntil", { mode: "number" }),
  passwordUpdatedAt: bigint("passwordUpdatedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const systemAdminSessions = mysqlTable("system_admin_sessions", {
  id: int("id").autoincrement().primaryKey(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastUsedAt: bigint("lastUsedAt", { mode: "number" }).notNull(),
});

export const staffPermissions = mysqlTable("staff_permissions", {
  userId: int("userId").primaryKey(),
  jobTitle: varchar("jobTitle", { length: 120 }).default("Technical Staff").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  preferredLanguage: mysqlEnum("preferredLanguage", ["en", "es"]).default("en").notNull(),
  permissions: text("permissions").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const staffSmtpSettings = mysqlTable("staff_smtp_settings", {
  userId: int("userId").primaryKey(),
  smtpHost: varchar("smtpHost", { length: 255 }).notNull(),
  smtpPort: int("smtpPort").notNull(),
  smtpSecurity: mysqlEnum("smtpSecurity", ["tls", "starttls", "none"]).default("tls").notNull(),
  smtpUsername: varchar("smtpUsername", { length: 320 }).notNull(),
  smtpPassword: text("smtpPassword").notNull(),
  fromEmail: varchar("fromEmail", { length: 320 }).notNull(),
  fromName: varchar("fromName", { length: 160 }).default("CareFlow").notNull(),
  replyToEmail: varchar("replyToEmail", { length: 320 }),
  isEnabled: boolean("isEnabled").default(true).notNull(),
  verifiedAt: bigint("verifiedAt", { mode: "number" }),
  lastTestedAt: bigint("lastTestedAt", { mode: "number" }),
  lastTestError: text("lastTestError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const emailTemplates = mysqlTable("email_templates", {
  userId: int("userId").primaryKey(),
  headerHtml: mediumtext("headerHtml").notNull(),
  footerHtml: mediumtext("footerHtml").notNull(),
  updatedBy: int("updatedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const emailProducts = mysqlTable("email_products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdBy: int("createdBy").notNull(),
  updatedBy: int("updatedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  uniqueName: uniqueIndex("email_products_name_unique").on(table.name),
  activeSort: index("email_products_active_sort_idx").on(table.isActive, table.sortOrder),
}));

export const emailMessageTemplates = mysqlTable("email_message_templates", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  subject: varchar("subject", { length: 240 }).notNull(),
  contentMode: mysqlEnum("contentMode", ["plain", "html"]).default("plain").notNull(),
  bodyText: mediumtext("bodyText").notNull(),
  bodyHtml: mediumtext("bodyHtml"),
  sourceFileName: varchar("sourceFileName", { length: 255 }),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdBy: int("createdBy").notNull(),
  updatedBy: int("updatedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  uniqueProductName: uniqueIndex("email_message_templates_productId_name_unique").on(table.productId, table.name),
  productActiveSort: index("email_message_templates_product_active_sort_idx").on(table.productId, table.isActive, table.sortOrder),
}));

export const staffInvites = mysqlTable("staff_invites", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  fullName: varchar("fullName", { length: 160 }).notNull(),
  jobTitle: varchar("jobTitle", { length: 120 }).default("Technical Staff").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  permissions: text("permissions").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "revoked", "expired"])
    .default("pending")
    .notNull(),
  createdBy: int("createdBy").notNull(),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
  acceptedBy: int("acceptedBy"),
  acceptedAt: bigint("acceptedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const passwordResetRequests = mysqlTable("password_reset_requests", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).unique(),
  status: mysqlEnum("status", ["pending", "ready", "used", "rejected", "expired"])
    .default("pending")
    .notNull(),
  requestedAt: bigint("requestedAt", { mode: "number" }).notNull(),
  preparedBy: int("preparedBy"),
  preparedAt: bigint("preparedAt", { mode: "number" }),
  expiresAt: bigint("expiresAt", { mode: "number" }),
  usedAt: bigint("usedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  firstName: varchar("firstName", { length: 120 }).notNull(),
  lastName: varchar("lastName", { length: 120 }).notNull(),
  preferredLanguage: mysqlEnum("preferredLanguage", ["en", "es"]).default("en").notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 80 }),
  dateOfBirth: varchar("dateOfBirth", { length: 80 }),
  address: text("address"),
  city: varchar("city", { length: 120 }),
  stateProvince: varchar("stateProvince", { length: 120 }),
  postalCode: varchar("postalCode", { length: 40 }),
  country: varchar("country", { length: 120 }),
  diagnosis: text("diagnosis"),
  diagnosisCategory: varchar("diagnosisCategory", { length: 80 }),
  stateCode: varchar("stateCode", { length: 2 }),
  clinicalNotes: text("clinicalNotes"),
  additionalInformation: text("additionalInformation"),
  sourceDocumentType: varchar("sourceDocumentType", { length: 80 }),
  status: mysqlEnum("status", [
    "new",
    "pending_review",
    "verified",
    "to_contact",
    "voicemail_left",
    "contacted",
    "follow_up",
    "interested",
    "highly_interested",
    "qualified",
    "customer",
    "buyer",
    "not_interested",
    "unable_to_reach",
    "archived",
  ])
    .default("new")
    .notNull(),
  interestLevel: mysqlEnum("interestLevel", ["unknown", "cold", "warm", "hot"])
    .default("unknown")
    .notNull(),
  assignedTo: int("assignedTo"),
  createdBy: int("createdBy").notNull(),
  lastContactAt: bigint("lastContactAt", { mode: "number" }),
  nextFollowUpAt: bigint("nextFollowUpAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const leadGroups = mysqlTable("lead_groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  ownerId: int("ownerId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const leadGroupMembers = mysqlTable("lead_group_members", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  leadId: int("leadId").notNull(),
  addedBy: int("addedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  uniqueGroupLead: uniqueIndex("lead_group_members_groupId_leadId_unique").on(table.groupId, table.leadId),
}));

export const leadShares = mysqlTable("lead_shares", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  sharedWithUserId: int("sharedWithUserId").notNull(),
  sharedByUserId: int("sharedByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  uniqueLeadShare: uniqueIndex("lead_shares_leadId_sharedWith_unique").on(table.leadId, table.sharedWithUserId),
}));

export const leadGroupShares = mysqlTable("lead_group_shares", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  sharedWithUserId: int("sharedWithUserId").notNull(),
  sharedByUserId: int("sharedByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  uniqueGroupShare: uniqueIndex("lead_group_shares_groupId_sharedWith_unique").on(table.groupId, table.sharedWithUserId),
}));

export const followUpReminders = mysqlTable("follow_up_reminders", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  sourceCommunicationId: int("sourceCommunicationId"),
  recipientUserId: int("recipientUserId").notNull(),
  createdBy: int("createdBy").default(-1000000).notNull(),
  scheduledFor: bigint("scheduledFor", { mode: "number" }).notNull(),
  remindAt: bigint("remindAt", { mode: "number" }).notNull(),
  readAt: bigint("readAt", { mode: "number" }),
  staffEmailStatus: mysqlEnum("staffEmailStatus", ["pending", "sent", "failed", "skipped"]).default("pending").notNull(),
  leadEmailStatus: mysqlEnum("leadEmailStatus", ["pending", "sent", "failed", "skipped"]).default("pending").notNull(),
  staffSentAt: bigint("staffSentAt", { mode: "number" }),
  leadSentAt: bigint("leadSentAt", { mode: "number" }),
  lastError: text("lastError"),
  attempts: int("attempts").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  uniqueReminder: uniqueIndex("follow_up_reminders_lead_recipient_time_unique").on(table.leadId, table.recipientUserId, table.scheduledFor),
  uniqueSourceCommunication: uniqueIndex("follow_up_reminders_sourceCommunicationId_unique").on(table.sourceCommunicationId),
  recipientSchedule: index("follow_up_reminders_recipientUserId_scheduledFor_idx").on(table.recipientUserId, table.scheduledFor),
  leadSchedule: index("follow_up_reminders_leadId_scheduledFor_idx").on(table.leadId, table.scheduledFor),
}));

export const scheduledJobs = mysqlTable("scheduled_jobs", {
  id: int("id").autoincrement().primaryKey(),
  jobKey: varchar("jobKey", { length: 80 }).notNull().unique(),
  taskUid: varchar("taskUid", { length: 65 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const leadIdentityKeys = mysqlTable("lead_identity_keys", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  keyType: mysqlEnum("keyType", ["email", "phone", "profile"]).notNull(),
  keyHash: varchar("keyHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  uniqueIdentity: uniqueIndex("lead_identity_keys_keyHash_unique").on(table.keyHash),
  leadKeyType: uniqueIndex("lead_identity_keys_leadId_keyType_unique").on(table.leadId, table.keyType),
}));

export const leadDocuments = mysqlTable("lead_documents", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  fileKey: text("fileKey").notNull(),
  fileUrl: text("fileUrl").notNull(),
  uploadedBy: int("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const communications = mysqlTable("communications", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  method: mysqlEnum("method", ["phone", "email", "sms", "in_person", "other"]).notNull(),
  direction: mysqlEnum("direction", ["outbound", "inbound"]).default("outbound").notNull(),
  outcome: varchar("outcome", { length: 160 }).notNull(),
  notes: text("notes"),
  contactedAt: bigint("contactedAt", { mode: "number" }).notNull(),
  nextFollowUpAt: bigint("nextFollowUpAt", { mode: "number" }),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const outboundEmails = mysqlTable("outbound_emails", {
  id: int("id").autoincrement().primaryKey(),
  senderUserId: int("senderUserId").notNull(),
  leadId: int("leadId").notNull(),
  recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
  recipientName: varchar("recipientName", { length: 241 }).notNull(),
  fromEmail: varchar("fromEmail", { length: 320 }).notNull(),
  productId: int("productId"),
  messageTemplateId: int("messageTemplateId"),
  productName: varchar("productName", { length: 160 }),
  templateName: varchar("templateName", { length: 160 }),
  subject: varchar("subject", { length: 240 }).notNull(),
  bodyHtml: mediumtext("bodyHtml").notNull(),
  status: mysqlEnum("status", ["sent", "failed"]).notNull(),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  error: text("error"),
  sentAt: bigint("sentAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  senderSent: index("outbound_emails_senderUserId_sentAt_idx").on(table.senderUserId, table.sentAt),
  leadSent: index("outbound_emails_leadId_sentAt_idx").on(table.leadId, table.sentAt),
}));

export const completedFollowUps = mysqlTable("completed_follow_ups", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  followUpId: int("followUpId"),
  communicationId: int("communicationId").notNull(),
  completedBy: int("completedBy").notNull(),
  scheduledFor: bigint("scheduledFor", { mode: "number" }).notNull(),
  completedAt: bigint("completedAt", { mode: "number" }).notNull(),
  method: mysqlEnum("method", ["phone", "email", "sms", "in_person", "other"]).notNull(),
  outcome: varchar("outcome", { length: 160 }).notNull(),
  notes: text("notes"),
  nextFollowUpAt: bigint("nextFollowUpAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  uniqueCommunication: uniqueIndex("completed_follow_ups_communicationId_unique").on(table.communicationId),
  uniqueFollowUp: uniqueIndex("completed_follow_ups_followUpId_unique").on(table.followUpId),
}));

export const auditEvents = mysqlTable("audit_events", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId"),
  actorId: int("actorId").notNull(),
  action: varchar("action", { length: 120 }).notNull(),
  source: varchar("source", { length: 60 }).default("system").notNull(),
  detail: text("detail"),
  changes: text("changes"),
  snapshotBefore: text("snapshotBefore"),
  snapshotAfter: text("snapshotAfter"),
  occurredAt: bigint("occurredAt", { mode: "number" }).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;
