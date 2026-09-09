import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  authSessions,
  auditEvents,
  communications,
  InsertLead,
  InsertUser,
  Lead,
  leadDocuments,
  leads,
  localCredentials,
  staffInvites,
  staffPermissions,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { leadChanges, leadSnapshot, serializeAudit } from "./leadAudit";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    _db = drizzle(process.env.DATABASE_URL);
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await requireDb();
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  } else {
    values.lastSignedIn = new Date();
    updateSet.lastSignedIn = new Date();
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await requireDb();
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(userId: number) {
  const db = await requireDb();
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}

export async function getLocalCredential(identifier: string) {
  const db = await requireDb();
  const result = await db
    .select({ credential: localCredentials, user: users })
    .from(localCredentials)
    .innerJoin(users, eq(users.id, localCredentials.userId))
    .where(eq(localCredentials.identifier, identifier.toLowerCase()))
    .limit(1);
  return result[0];
}

export async function createLocalUser(input: {
  openId: string;
  name: string;
  email: string | null;
  role: "user" | "admin";
  identifier: string;
  passwordHash: string;
  passwordSalt: string;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const result = await tx.insert(users).values({
      openId: input.openId,
      name: input.name,
      email: input.email,
      loginMethod: "local",
      role: input.role,
      lastSignedIn: new Date(),
    });
    const userId = Number(result[0].insertId);
    await tx.insert(localCredentials).values({
      userId,
      identifier: input.identifier.toLowerCase(),
      passwordHash: input.passwordHash,
      passwordSalt: input.passwordSalt,
      passwordUpdatedAt: Date.now(),
    });
    return userId;
  });
}

export async function createCredentialForUser(input: {
  userId: number;
  identifier: string;
  passwordHash: string;
  passwordSalt: string;
}) {
  const db = await requireDb();
  await db.insert(localCredentials).values({
    userId: input.userId,
    identifier: input.identifier.toLowerCase(),
    passwordHash: input.passwordHash,
    passwordSalt: input.passwordSalt,
    passwordUpdatedAt: Date.now(),
  });
}

export async function updateLoginFailure(userId: number, failedLoginCount: number, lockedUntil: number | null) {
  const db = await requireDb();
  await db.update(localCredentials).set({ failedLoginCount, lockedUntil }).where(eq(localCredentials.userId, userId));
}

export async function updateLocalPassword(userId: number, passwordHash: string, passwordSalt: string) {
  const db = await requireDb();
  await db.update(localCredentials).set({
    passwordHash,
    passwordSalt,
    passwordUpdatedAt: Date.now(),
    failedLoginCount: 0,
    lockedUntil: null,
  }).where(eq(localCredentials.userId, userId));
}

export async function recordSuccessfulLogin(userId: number) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.update(localCredentials).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(localCredentials.userId, userId));
    await tx.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
  });
}

export async function createAuthSession(input: { tokenHash: string; userId: number; expiresAt: number }) {
  const db = await requireDb();
  await db.insert(authSessions).values({ ...input, lastUsedAt: Date.now() });
}

export async function getAuthSession(tokenHash: string) {
  const db = await requireDb();
  const result = await db
    .select({ session: authSessions, user: users })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(eq(authSessions.tokenHash, tokenHash))
    .limit(1);
  return result[0];
}

export async function touchAuthSession(sessionId: number) {
  const db = await requireDb();
  await db.update(authSessions).set({ lastUsedAt: Date.now() }).where(eq(authSessions.id, sessionId));
}

export async function deleteAuthSession(tokenHash: string) {
  const db = await requireDb();
  await db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
}

export async function deleteExpiredSessions() {
  const db = await requireDb();
  await db.delete(authSessions).where(sql`${authSessions.expiresAt} < ${Date.now()}`);
}

export async function getStaffPermissionRecord(userId: number) {
  const db = await requireDb();
  const result = await db.select().from(staffPermissions).where(eq(staffPermissions.userId, userId)).limit(1);
  return result[0];
}

export async function listStaff() {
  const db = await requireDb();
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      loginIdentifier: localCredentials.identifier,
      lastSignedIn: users.lastSignedIn,
      jobTitle: staffPermissions.jobTitle,
      isActive: staffPermissions.isActive,
      permissions: staffPermissions.permissions,
    })
    .from(users)
    .innerJoin(localCredentials, eq(users.id, localCredentials.userId))
    .leftJoin(staffPermissions, eq(users.id, staffPermissions.userId))
    .orderBy(desc(users.lastSignedIn));
}

export async function upsertStaffPermissions(input: {
  userId: number;
  jobTitle: string;
  isActive: boolean;
  permissions: string;
}) {
  const db = await requireDb();
  await db.insert(staffPermissions).values(input).onDuplicateKeyUpdate({
    set: { jobTitle: input.jobTitle, isActive: input.isActive, permissions: input.permissions },
  });
}

export async function createStaffInvite(input: typeof staffInvites.$inferInsert) {
  const db = await requireDb();
  const result = await db.insert(staffInvites).values(input);
  return Number(result[0].insertId);
}

export async function listStaffInvites() {
  const db = await requireDb();
  return db.select().from(staffInvites).orderBy(desc(staffInvites.createdAt));
}

export async function getInviteByHash(tokenHash: string) {
  const db = await requireDb();
  const result = await db.select().from(staffInvites).where(eq(staffInvites.tokenHash, tokenHash)).limit(1);
  return result[0];
}

export async function acceptInvite(inviteId: number, userId: number, jobTitle: string, permissions: string) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.insert(staffPermissions).values({ userId, jobTitle, permissions, isActive: true }).onDuplicateKeyUpdate({
      set: { jobTitle, permissions, isActive: true },
    });
    await tx.update(staffInvites).set({ status: "accepted", acceptedBy: userId, acceptedAt: Date.now() }).where(eq(staffInvites.id, inviteId));
  });
}

export async function createInvitedStaff(input: {
  inviteId: number;
  openId: string;
  name: string;
  email: string;
  identifier: string;
  passwordHash: string;
  passwordSalt: string;
  jobTitle: string;
  permissions: string;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const userResult = await tx.insert(users).values({
      openId: input.openId,
      name: input.name,
      email: input.email.toLowerCase(),
      loginMethod: "local",
      role: "user",
      lastSignedIn: new Date(),
    });
    const userId = Number(userResult[0].insertId);
    await tx.insert(localCredentials).values({
      userId,
      identifier: input.identifier.toLowerCase(),
      passwordHash: input.passwordHash,
      passwordSalt: input.passwordSalt,
      passwordUpdatedAt: Date.now(),
    });
    await tx.insert(staffPermissions).values({
      userId,
      jobTitle: input.jobTitle,
      permissions: input.permissions,
      isActive: true,
    });
    await tx.update(staffInvites).set({
      status: "accepted",
      acceptedBy: userId,
      acceptedAt: Date.now(),
    }).where(eq(staffInvites.id, input.inviteId));
    return userId;
  });
}

export async function listLeads(input: { search?: string; status?: string; assignedTo?: number }) {
  const db = await requireDb();
  const filters = [];
  if (input.search) {
    const term = `%${input.search}%`;
    filters.push(or(like(leads.firstName, term), like(leads.lastName, term), like(leads.email, term), like(leads.phone, term))!);
  }
  if (input.status && input.status !== "all") filters.push(eq(leads.status, input.status as typeof leads.status.enumValues[number]));
  if (input.assignedTo) filters.push(eq(leads.assignedTo, input.assignedTo));
  return db.select().from(leads).where(filters.length ? and(...filters) : undefined).orderBy(desc(leads.updatedAt));
}

export async function getLeadStatusCounts() {
  const db = await requireDb();
  return db
    .select({ status: leads.status, count: sql<number>`count(*)` })
    .from(leads)
    .groupBy(leads.status)
    .orderBy(asc(leads.status));
}

export async function getLeadExportRows(statuses: Array<typeof leads.status.enumValues[number]>) {
  const db = await requireDb();
  const [rows, staff] = await Promise.all([
    db.select({
      id: leads.id,
      firstName: leads.firstName,
      lastName: leads.lastName,
      email: leads.email,
      phone: leads.phone,
      address: leads.address,
      city: leads.city,
      stateProvince: leads.stateProvince,
      postalCode: leads.postalCode,
      country: leads.country,
      status: leads.status,
      interestLevel: leads.interestLevel,
      assignedTo: leads.assignedTo,
      nextFollowUpAt: leads.nextFollowUpAt,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
    })
      .from(leads)
      .where(inArray(leads.status, statuses))
      .orderBy(asc(leads.status), asc(leads.lastName), asc(leads.firstName))
      .limit(5000),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users),
  ]);
  const staffNames = new Map(staff.map(member => [member.id, member.name || member.email || `Staff #${member.id}`]));
  return rows.map(({ assignedTo, ...row }) => ({
    ...row,
    assignedStaff: assignedTo ? staffNames.get(assignedTo) ?? `Staff #${assignedTo}` : null,
  }));
}

export async function listAssignableStaff() {
  const db = await requireDb();
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, jobTitle: staffPermissions.jobTitle })
    .from(users)
    .innerJoin(localCredentials, eq(users.id, localCredentials.userId))
    .leftJoin(staffPermissions, eq(users.id, staffPermissions.userId))
    .where(or(eq(users.role, "admin"), eq(staffPermissions.isActive, true)))
    .orderBy(asc(users.name));
}

export async function getLead(leadId: number) {
  const db = await requireDb();
  const lead = (await db.select().from(leads).where(eq(leads.id, leadId)).limit(1))[0];
  if (!lead) return null;
  const [documents, contactHistory, auditHistory] = await Promise.all([
    db.select().from(leadDocuments).where(eq(leadDocuments.leadId, leadId)).orderBy(desc(leadDocuments.createdAt)),
    db.select().from(communications).where(eq(communications.leadId, leadId)).orderBy(desc(communications.contactedAt)),
    db.select({
      id: auditEvents.id,
      leadId: auditEvents.leadId,
      actorId: auditEvents.actorId,
      actorName: users.name,
      actorEmail: users.email,
      action: auditEvents.action,
      source: auditEvents.source,
      detail: auditEvents.detail,
      changes: auditEvents.changes,
      snapshotBefore: auditEvents.snapshotBefore,
      snapshotAfter: auditEvents.snapshotAfter,
      occurredAt: auditEvents.occurredAt,
    }).from(auditEvents).leftJoin(users, eq(auditEvents.actorId, users.id)).where(eq(auditEvents.leadId, leadId)).orderBy(desc(auditEvents.occurredAt)),
  ]);
  return { lead, documents, communications: contactHistory, auditEvents: auditHistory };
}

export async function createLeadWithAudit(input: InsertLead, audit: { actorId: number; source: string; detail: string }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const result = await tx.insert(leads).values(input);
    const leadId = Number(result[0].insertId);
    const created = (await tx.select().from(leads).where(eq(leads.id, leadId)).limit(1))[0];
    const changes = leadChanges({}, created);
    await tx.insert(auditEvents).values({
      leadId,
      actorId: audit.actorId,
      action: "lead.created",
      source: audit.source,
      detail: audit.detail,
      changes: serializeAudit(changes),
      snapshotBefore: null,
      snapshotAfter: serializeAudit(leadSnapshot(created)),
      occurredAt: Date.now(),
    });
    return leadId;
  });
}

export async function updateLeadWithAudit(
  leadId: number,
  values: Partial<InsertLead>,
  audit: { actorId: number; action: string; source: string; detail: string },
) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const before = (await tx.select().from(leads).where(eq(leads.id, leadId)).limit(1).for("update"))[0];
    if (!before) return null;
    const after = { ...before, ...values } as Lead;
    const changes = leadChanges(before, after);
    if (!changes.length) return { lead: before, changes };
    await tx.update(leads).set(values).where(eq(leads.id, leadId));
    await tx.insert(auditEvents).values({
      leadId,
      actorId: audit.actorId,
      action: audit.action,
      source: audit.source,
      detail: audit.detail,
      changes: serializeAudit(changes),
      snapshotBefore: serializeAudit(leadSnapshot(before)),
      snapshotAfter: serializeAudit(leadSnapshot(after)),
      occurredAt: Date.now(),
    });
    return { lead: after, changes };
  });
}

export async function addLeadDocument(input: typeof leadDocuments.$inferInsert) {
  const db = await requireDb();
  await db.insert(leadDocuments).values(input);
}

export async function addCommunicationWithAudit(input: typeof communications.$inferInsert) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const before = (await tx.select().from(leads).where(eq(leads.id, input.leadId)).limit(1).for("update"))[0];
    if (!before) return null;
    const status = input.nextFollowUpAt ? "follow_up" : "contacted";
    const leadUpdate = {
      lastContactAt: input.contactedAt,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
      status,
    } as const;
    const after = { ...before, ...leadUpdate } as Lead;
    await tx.insert(communications).values(input);
    await tx.update(leads).set(leadUpdate).where(eq(leads.id, input.leadId));
    await tx.insert(auditEvents).values({
      leadId: input.leadId,
      actorId: input.createdBy,
      action: "communication.logged",
      source: "communication",
      detail: `${input.method}: ${input.outcome}`,
      changes: serializeAudit(leadChanges(before, after)),
      snapshotBefore: serializeAudit(leadSnapshot(before)),
      snapshotAfter: serializeAudit(leadSnapshot(after)),
      occurredAt: Date.now(),
    });
    return after;
  });
}

export async function addAuditEvent(input: typeof auditEvents.$inferInsert) {
  const db = await requireDb();
  await db.insert(auditEvents).values(input);
}

export async function getDashboardSummary() {
  const db = await requireDb();
  const now = Date.now();
  const [totals, followUps, recent] = await Promise.all([
    db.select({
      total: sql<number>`count(*)`,
      hot: sql<number>`sum(case when ${leads.interestLevel} = 'hot' then 1 else 0 end)`,
      buyers: sql<number>`sum(case when ${leads.status} = 'buyer' then 1 else 0 end)`,
    }).from(leads),
    db.select({ count: sql<number>`count(*)` }).from(leads).where(and(sql`${leads.nextFollowUpAt} is not null`, sql`${leads.nextFollowUpAt} <= ${now + 7 * 24 * 60 * 60 * 1000}`)),
    db.select().from(leads).orderBy(desc(leads.updatedAt)).limit(6),
  ]);
  return {
    total: Number(totals[0]?.total ?? 0),
    hot: Number(totals[0]?.hot ?? 0),
    buyers: Number(totals[0]?.buyers ?? 0),
    followUps: Number(followUps[0]?.count ?? 0),
    recent,
  };
}

export async function getUpcomingFollowUps() {
  const db = await requireDb();
  return db.select().from(leads).where(sql`${leads.nextFollowUpAt} is not null`).orderBy(asc(leads.nextFollowUpAt)).limit(50);
}
