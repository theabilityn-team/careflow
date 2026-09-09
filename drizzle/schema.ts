import {
  bigint,
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
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

export const staffPermissions = mysqlTable("staff_permissions", {
  userId: int("userId").primaryKey(),
  jobTitle: varchar("jobTitle", { length: 120 }).default("Technical Staff").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  permissions: text("permissions").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

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

export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  firstName: varchar("firstName", { length: 120 }).notNull(),
  lastName: varchar("lastName", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 80 }),
  dateOfBirth: varchar("dateOfBirth", { length: 80 }),
  address: text("address"),
  city: varchar("city", { length: 120 }),
  stateProvince: varchar("stateProvince", { length: 120 }),
  postalCode: varchar("postalCode", { length: 40 }),
  country: varchar("country", { length: 120 }),
  diagnosis: text("diagnosis"),
  clinicalNotes: text("clinicalNotes"),
  additionalInformation: text("additionalInformation"),
  status: mysqlEnum("status", [
    "new",
    "pending_review",
    "verified",
    "to_contact",
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

export const auditEvents = mysqlTable("audit_events", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId"),
  actorId: int("actorId").notNull(),
  action: varchar("action", { length: 120 }).notNull(),
  detail: text("detail"),
  occurredAt: bigint("occurredAt", { mode: "number" }).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;
