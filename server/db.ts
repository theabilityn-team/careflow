import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lt, lte, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { SUPER_ADMIN_EMAIL, SYSTEM_ADMIN_ACTOR_ID } from "../shared/const";
import { inferSupportedStateCode } from "../shared/leadClassification";
import {
  authSessions,
  auditEvents,
  communications,
  followUpReminders,
  InsertLead,
  InsertUser,
  Lead,
  leadDocuments,
  leadGroupMembers,
  leadGroups,
  leadGroupShares,
  leadIdentityKeys,
  leadShares,
  leads,
  localCredentials,
  passwordResetRequests,
  scheduledJobs,
  staffInvites,
  staffPermissions,
  systemAdminCredentials,
  systemAdminSessions,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { leadChanges, leadSnapshot, serializeAudit } from "./leadAudit";
import { buildLeadIdentityKeys, identityMatchLabels, type LeadIdentityInput } from "./leadIdentity";
import { normalizeLeadPagination } from "./leadList";
import { communicationLeadUpdate } from "./leadWorkflow";
import { isPasswordResetUsable } from "./passwordSecurity";

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

export async function getSystemAdminCredential() {
  const db = await requireDb();
  return (await db.select().from(systemAdminCredentials).where(eq(systemAdminCredentials.id, 1)).limit(1))[0];
}

export async function upsertSystemAdminCredential(input: { passwordHash: string; passwordSalt: string }) {
  const db = await requireDb();
  await db.insert(systemAdminCredentials).values({
    id: 1,
    identifier: SUPER_ADMIN_EMAIL,
    name: "Super Administrator",
    passwordHash: input.passwordHash,
    passwordSalt: input.passwordSalt,
    passwordUpdatedAt: Date.now(),
  }).onDuplicateKeyUpdate({ set: {
    identifier: SUPER_ADMIN_EMAIL,
    name: "Super Administrator",
    passwordHash: input.passwordHash,
    passwordSalt: input.passwordSalt,
    passwordUpdatedAt: Date.now(),
    failedLoginCount: 0,
    lockedUntil: null,
  } });
}

export async function updateSystemAdminIdentifier() {
  const db = await requireDb();
  await db.update(systemAdminCredentials).set({
    identifier: SUPER_ADMIN_EMAIL,
    failedLoginCount: 0,
    lockedUntil: null,
  }).where(eq(systemAdminCredentials.id, 1));
}

export async function changeSystemAdminPassword(passwordHash: string, passwordSalt: string) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.update(systemAdminCredentials).set({
      passwordHash,
      passwordSalt,
      passwordUpdatedAt: Date.now(),
      failedLoginCount: 0,
      lockedUntil: null,
    }).where(eq(systemAdminCredentials.id, 1));
    await tx.delete(systemAdminSessions);
  });
}

export async function updateSystemAdminLoginFailure(failedLoginCount: number, lockedUntil: number | null) {
  const db = await requireDb();
  await db.update(systemAdminCredentials).set({ failedLoginCount, lockedUntil }).where(eq(systemAdminCredentials.id, 1));
}

export async function recordSuccessfulSystemAdminLogin() {
  const db = await requireDb();
  await db.update(systemAdminCredentials).set({ failedLoginCount: 0, lockedUntil: null, lastSignedIn: new Date() }).where(eq(systemAdminCredentials.id, 1));
}

export async function createSystemAdminSession(input: { tokenHash: string; expiresAt: number }) {
  const db = await requireDb();
  await db.insert(systemAdminSessions).values({ ...input, lastUsedAt: Date.now() });
}

export async function getSystemAdminSession(tokenHash: string) {
  const db = await requireDb();
  return (await db.select().from(systemAdminSessions).where(eq(systemAdminSessions.tokenHash, tokenHash)).limit(1))[0];
}

export async function touchSystemAdminSession(sessionId: number) {
  const db = await requireDb();
  await db.update(systemAdminSessions).set({ lastUsedAt: Date.now() }).where(eq(systemAdminSessions.id, sessionId));
}

export async function deleteSystemAdminSession(tokenHash: string) {
  const db = await requireDb();
  await db.delete(systemAdminSessions).where(eq(systemAdminSessions.tokenHash, tokenHash));
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
  await Promise.all([
    db.delete(authSessions).where(sql`${authSessions.expiresAt} < ${Date.now()}`),
    db.delete(systemAdminSessions).where(sql`${systemAdminSessions.expiresAt} < ${Date.now()}`),
  ]);
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
      preferredLanguage: staffPermissions.preferredLanguage,
      permissions: staffPermissions.permissions,
    })
    .from(users)
    .innerJoin(localCredentials, eq(users.id, localCredentials.userId))
    .leftJoin(staffPermissions, eq(users.id, staffPermissions.userId))
    .where(eq(users.role, "user"))
    .orderBy(desc(users.lastSignedIn));
}

export async function upsertStaffPermissions(input: {
  userId: number;
  jobTitle: string;
  isActive: boolean;
  permissions: string;
  preferredLanguage?: "en" | "es";
}) {
  const db = await requireDb();
  await db.insert(staffPermissions).values(input).onDuplicateKeyUpdate({
    set: { jobTitle: input.jobTitle, isActive: input.isActive, permissions: input.permissions, ...(input.preferredLanguage ? { preferredLanguage: input.preferredLanguage } : {}) },
  });
}

export async function updateStaffPreferredLanguage(userId: number, preferredLanguage: "en" | "es") {
  const db = await requireDb();
  await db.update(staffPermissions).set({ preferredLanguage }).where(eq(staffPermissions.userId, userId));
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

export async function createPasswordResetRequest(email: string) {
  const db = await requireDb();
  const normalized = email.trim().toLowerCase();
  const account = (await db
    .select({ userId: users.id, email: users.email, isActive: staffPermissions.isActive })
    .from(users)
    .innerJoin(localCredentials, eq(users.id, localCredentials.userId))
    .leftJoin(staffPermissions, eq(users.id, staffPermissions.userId))
    .where(and(eq(localCredentials.identifier, normalized), eq(users.role, "user")))
    .limit(1))[0];
  if (!account?.email) return false;
  const accountEmail = account.email.toLowerCase();

  await db.transaction(async tx => {
    await tx.update(passwordResetRequests).set({ status: "expired" }).where(and(
      eq(passwordResetRequests.userId, account.userId),
      inArray(passwordResetRequests.status, ["pending", "ready"]),
    ));
    await tx.insert(passwordResetRequests).values({
      userId: account.userId,
      email: accountEmail,
      status: "pending",
      requestedAt: Date.now(),
    });
  });
  return true;
}

export async function listPasswordResetRequests() {
  const db = await requireDb();
  await db.update(passwordResetRequests).set({ status: "expired" }).where(and(
    eq(passwordResetRequests.status, "ready"),
    isNotNull(passwordResetRequests.expiresAt),
    lt(passwordResetRequests.expiresAt, Date.now()),
  ));
  return db
    .select({ request: passwordResetRequests, staffName: users.name, isActive: staffPermissions.isActive })
    .from(passwordResetRequests)
    .leftJoin(users, eq(users.id, passwordResetRequests.userId))
    .leftJoin(staffPermissions, eq(staffPermissions.userId, passwordResetRequests.userId))
    .orderBy(desc(passwordResetRequests.requestedAt))
    .limit(100);
}

export async function preparePasswordReset(input: { requestId: number; tokenHash: string; preparedBy: number; expiresAt: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const request = (await tx.select().from(passwordResetRequests).where(eq(passwordResetRequests.id, input.requestId)).limit(1))[0];
    if (!request || !["pending", "ready"].includes(request.status)) return null;
    await tx.update(passwordResetRequests).set({
      tokenHash: input.tokenHash,
      status: "ready",
      preparedBy: input.preparedBy,
      preparedAt: Date.now(),
      expiresAt: input.expiresAt,
    }).where(eq(passwordResetRequests.id, input.requestId));
    return request;
  });
}

export async function rejectPasswordReset(requestId: number) {
  const db = await requireDb();
  const result = await db.update(passwordResetRequests).set({
    status: "rejected",
    tokenHash: null,
    expiresAt: null,
  }).where(and(eq(passwordResetRequests.id, requestId), inArray(passwordResetRequests.status, ["pending", "ready"])));
  return Number(result[0].affectedRows) > 0;
}

export async function getPasswordResetByHash(tokenHash: string) {
  const db = await requireDb();
  return (await db
    .select({ request: passwordResetRequests, staffName: users.name })
    .from(passwordResetRequests)
    .leftJoin(users, eq(users.id, passwordResetRequests.userId))
    .where(eq(passwordResetRequests.tokenHash, tokenHash))
    .limit(1))[0];
}

export async function completePasswordReset(input: { tokenHash: string; passwordHash: string; passwordSalt: string; now: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const request = (await tx.select().from(passwordResetRequests).where(eq(passwordResetRequests.tokenHash, input.tokenHash)).limit(1))[0];
    if (!request || !isPasswordResetUsable(request.status, request.expiresAt, input.now)) return null;
    const account = (await tx.select({ userId: localCredentials.userId }).from(localCredentials).where(eq(localCredentials.userId, request.userId)).limit(1))[0];
    if (!account) return null;
    const claimed = await tx.update(passwordResetRequests).set({ status: "used", usedAt: input.now }).where(and(
      eq(passwordResetRequests.id, request.id),
      eq(passwordResetRequests.status, "ready"),
    ));
    if (Number(claimed[0].affectedRows) !== 1) return null;
    await tx.update(localCredentials).set({
      passwordHash: input.passwordHash,
      passwordSalt: input.passwordSalt,
      passwordUpdatedAt: input.now,
      failedLoginCount: 0,
      lockedUntil: null,
    }).where(eq(localCredentials.userId, request.userId));
    await tx.delete(authSessions).where(eq(authSessions.userId, request.userId));
    return request.userId;
  });
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

export type LeadListInput = {
  search?: string;
  status?: string;
  interestLevel?: "unknown" | "cold" | "warm" | "hot";
  assignedTo?: number | "unassigned";
  followUpState?: "overdue" | "upcoming" | "none";
  contactState?: "contacted" | "not_contacted";
  stateCode?: "FL" | "AZ" | "NV" | "CA";
  diagnosisCategory?: "oncology" | "hematology";
  groupId?: number;
  createdFrom?: number;
  createdTo?: number;
  sort?: "updated_desc" | "created_desc" | "name_asc" | "name_desc" | "follow_up_asc";
  page: number;
  pageSize: number;
};

function leadVisibilityCondition(userId: number, isSuperAdmin: boolean) {
  if (isSuperAdmin) return undefined;
  return sql<boolean>`(
    ${leads.createdBy} = ${userId}
    OR ${leads.assignedTo} = ${userId}
    OR EXISTS (
      SELECT 1 FROM ${leadShares}
      WHERE ${leadShares.leadId} = ${leads.id}
        AND ${leadShares.sharedWithUserId} = ${userId}
    )
    OR EXISTS (
      SELECT 1 FROM ${leadGroupMembers}
      INNER JOIN ${leadGroups} ON ${leadGroups.id} = ${leadGroupMembers.groupId}
      WHERE ${leadGroupMembers.leadId} = ${leads.id}
        AND ${leadGroups.ownerId} = ${userId}
    )
    OR EXISTS (
      SELECT 1 FROM ${leadGroupMembers}
      INNER JOIN ${leadGroupShares} ON ${leadGroupShares.groupId} = ${leadGroupMembers.groupId}
      WHERE ${leadGroupMembers.leadId} = ${leads.id}
        AND ${leadGroupShares.sharedWithUserId} = ${userId}
    )
  )`;
}

export async function canAccessLead(leadId: number, userId: number, isSuperAdmin: boolean) {
  const db = await requireDb();
  const visibility = leadVisibilityCondition(userId, isSuperAdmin);
  const result = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.id, leadId), visibility)).limit(1);
  return Boolean(result[0]);
}

export async function canManageLeadSharing(leadId: number, userId: number, isSuperAdmin: boolean) {
  const db = await requireDb();
  if (isSuperAdmin) return Boolean((await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId)).limit(1))[0]);
  return Boolean((await db.select({ id: leads.id }).from(leads).where(and(eq(leads.id, leadId), eq(leads.createdBy, userId))).limit(1))[0]);
}

export async function listLeads(input: LeadListInput, viewer: { userId: number; isSuperAdmin: boolean }) {
  const db = await requireDb();
  const filters = [];
  const visibility = leadVisibilityCondition(viewer.userId, viewer.isSuperAdmin);
  if (visibility) filters.push(visibility);
  if (input.search) {
    const term = `%${input.search}%`;
    filters.push(or(like(leads.firstName, term), like(leads.lastName, term), like(leads.email, term), like(leads.phone, term), like(leads.address, term), like(leads.city, term))!);
  }
  if (input.status && input.status !== "all") filters.push(eq(leads.status, input.status as typeof leads.status.enumValues[number]));
  if (input.interestLevel) filters.push(eq(leads.interestLevel, input.interestLevel));
  if (input.assignedTo === "unassigned") filters.push(isNull(leads.assignedTo));
  else if (input.assignedTo) filters.push(eq(leads.assignedTo, input.assignedTo));
  const now = Date.now();
  if (input.followUpState === "overdue") filters.push(and(isNotNull(leads.nextFollowUpAt), lt(leads.nextFollowUpAt, now))!);
  if (input.followUpState === "upcoming") filters.push(gte(leads.nextFollowUpAt, now));
  if (input.followUpState === "none") filters.push(isNull(leads.nextFollowUpAt));
  if (input.contactState === "contacted") filters.push(isNotNull(leads.lastContactAt));
  if (input.contactState === "not_contacted") filters.push(isNull(leads.lastContactAt));
  if (input.stateCode) filters.push(eq(leads.stateCode, input.stateCode));
  if (input.diagnosisCategory) filters.push(eq(leads.diagnosisCategory, input.diagnosisCategory));
  if (input.groupId) filters.push(sql<boolean>`EXISTS (
    SELECT 1 FROM ${leadGroupMembers}
    WHERE ${leadGroupMembers.groupId} = ${input.groupId}
      AND ${leadGroupMembers.leadId} = ${leads.id}
  )`);
  if (input.createdFrom) filters.push(gte(leads.createdAt, new Date(input.createdFrom)));
  if (input.createdTo) filters.push(lte(leads.createdAt, new Date(input.createdTo)));

  const where = filters.length ? and(...filters) : undefined;
  const countRows = await db.select({ count: sql<number>`count(*)` }).from(leads).where(where);
  const pagination = normalizeLeadPagination(Number(countRows[0]?.count ?? 0), input.page, input.pageSize);
  const orderBy = input.sort === "created_desc" ? [desc(leads.createdAt)]
    : input.sort === "name_asc" ? [asc(leads.lastName), asc(leads.firstName)]
      : input.sort === "name_desc" ? [desc(leads.lastName), desc(leads.firstName)]
        : input.sort === "follow_up_asc" ? [sql`${leads.nextFollowUpAt} is null`, asc(leads.nextFollowUpAt), desc(leads.updatedAt)]
          : [desc(leads.updatedAt)];
  const items = await db.select().from(leads).where(where).orderBy(...orderBy).limit(pagination.pageSize).offset(pagination.offset);
  return { items, total: pagination.total, page: pagination.page, pageSize: pagination.pageSize, totalPages: pagination.totalPages };
}

export async function getLeadStatusCounts(viewer: { userId: number; isSuperAdmin: boolean }) {
  const db = await requireDb();
  const visibility = leadVisibilityCondition(viewer.userId, viewer.isSuperAdmin);
  return db
    .select({ status: leads.status, count: sql<number>`count(*)` })
    .from(leads)
    .where(visibility)
    .groupBy(leads.status)
    .orderBy(asc(leads.status));
}

export async function getLeadExportRows(statuses: Array<typeof leads.status.enumValues[number]>, viewer: { userId: number; isSuperAdmin: boolean }) {
  const db = await requireDb();
  const visibility = leadVisibilityCondition(viewer.userId, viewer.isSuperAdmin);
  const [rows, staff] = await Promise.all([
    db.select({
      id: leads.id,
      firstName: leads.firstName,
      lastName: leads.lastName,
      email: leads.email,
      phone: leads.phone,
      address: leads.address,
      city: leads.city,
      stateCode: leads.stateCode,
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
      .where(and(inArray(leads.status, statuses), visibility))
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

export async function listLeadGroups(viewer: { userId: number; isSuperAdmin: boolean }) {
  const db = await requireDb();
  const visibility = viewer.isSuperAdmin ? undefined : or(
    eq(leadGroups.ownerId, viewer.userId),
    sql<boolean>`EXISTS (
      SELECT 1 FROM ${leadGroupShares}
      WHERE ${leadGroupShares.groupId} = ${leadGroups.id}
        AND ${leadGroupShares.sharedWithUserId} = ${viewer.userId}
    )`,
  );
  return db.select({
    id: leadGroups.id,
    name: leadGroups.name,
    description: leadGroups.description,
    ownerId: leadGroups.ownerId,
    ownerName: users.name,
    canManage: viewer.isSuperAdmin ? sql<boolean>`true` : sql<boolean>`${leadGroups.ownerId} = ${viewer.userId}`,
    createdAt: leadGroups.createdAt,
    updatedAt: leadGroups.updatedAt,
    memberCount: sql<number>`(SELECT count(*) FROM ${leadGroupMembers} WHERE ${leadGroupMembers.groupId} = ${leadGroups.id})`,
    shareCount: sql<number>`(SELECT count(*) FROM ${leadGroupShares} WHERE ${leadGroupShares.groupId} = ${leadGroups.id})`,
  }).from(leadGroups).leftJoin(users, eq(users.id, leadGroups.ownerId)).where(visibility).orderBy(desc(leadGroups.updatedAt));
}

export async function getLeadGroup(groupId: number, viewer: { userId: number; isSuperAdmin: boolean }) {
  const db = await requireDb();
  const visibility = viewer.isSuperAdmin ? undefined : or(
    eq(leadGroups.ownerId, viewer.userId),
    sql<boolean>`EXISTS (SELECT 1 FROM ${leadGroupShares} WHERE ${leadGroupShares.groupId} = ${leadGroups.id} AND ${leadGroupShares.sharedWithUserId} = ${viewer.userId})`,
  );
  const group = (await db.select({ group: leadGroups, ownerName: users.name }).from(leadGroups).leftJoin(users, eq(users.id, leadGroups.ownerId)).where(and(eq(leadGroups.id, groupId), visibility)).limit(1))[0];
  if (!group) return null;
  const [members, shares] = await Promise.all([
    db.select({ lead: leads, addedAt: leadGroupMembers.createdAt }).from(leadGroupMembers).innerJoin(leads, eq(leads.id, leadGroupMembers.leadId)).where(eq(leadGroupMembers.groupId, groupId)).orderBy(desc(leadGroupMembers.createdAt)),
    db.select({ id: leadGroupShares.id, userId: users.id, name: users.name, email: users.email }).from(leadGroupShares).innerJoin(users, eq(users.id, leadGroupShares.sharedWithUserId)).where(eq(leadGroupShares.groupId, groupId)).orderBy(asc(users.name)),
  ]);
  return { ...group, members, shares };
}

export async function createLeadGroup(input: { name: string; description?: string | null; ownerId: number }) {
  const db = await requireDb();
  const result = await db.insert(leadGroups).values(input);
  return Number(result[0].insertId);
}

export async function updateLeadGroup(groupId: number, values: { name?: string; description?: string | null }) {
  const db = await requireDb();
  await db.update(leadGroups).set(values).where(eq(leadGroups.id, groupId));
}

export async function canManageLeadGroup(groupId: number, userId: number, isSuperAdmin: boolean) {
  const db = await requireDb();
  const condition = isSuperAdmin ? eq(leadGroups.id, groupId) : and(eq(leadGroups.id, groupId), eq(leadGroups.ownerId, userId));
  return Boolean((await db.select({ id: leadGroups.id }).from(leadGroups).where(condition).limit(1))[0]);
}

export async function addLeadToGroup(input: { groupId: number; leadId: number; addedBy: number }) {
  const db = await requireDb();
  await db.insert(leadGroupMembers).values(input).onDuplicateKeyUpdate({ set: { addedBy: input.addedBy } });
}

export async function removeLeadFromGroup(groupId: number, leadId: number) {
  const db = await requireDb();
  await db.delete(leadGroupMembers).where(and(eq(leadGroupMembers.groupId, groupId), eq(leadGroupMembers.leadId, leadId)));
}

export async function shareLead(input: { leadId: number; sharedWithUserId: number; sharedByUserId: number }) {
  const db = await requireDb();
  await db.insert(leadShares).values(input).onDuplicateKeyUpdate({ set: { sharedByUserId: input.sharedByUserId } });
}

export async function unshareLead(leadId: number, sharedWithUserId: number) {
  const db = await requireDb();
  await db.delete(leadShares).where(and(eq(leadShares.leadId, leadId), eq(leadShares.sharedWithUserId, sharedWithUserId)));
}

export async function shareLeadGroup(input: { groupId: number; sharedWithUserId: number; sharedByUserId: number }) {
  const db = await requireDb();
  await db.insert(leadGroupShares).values(input).onDuplicateKeyUpdate({ set: { sharedByUserId: input.sharedByUserId } });
}

export async function unshareLeadGroup(groupId: number, sharedWithUserId: number) {
  const db = await requireDb();
  await db.delete(leadGroupShares).where(and(eq(leadGroupShares.groupId, groupId), eq(leadGroupShares.sharedWithUserId, sharedWithUserId)));
}

export async function listLeadSharing(leadId: number) {
  const db = await requireDb();
  const [shares, groups] = await Promise.all([
    db.select({ id: leadShares.id, userId: users.id, name: users.name, email: users.email }).from(leadShares).innerJoin(users, eq(users.id, leadShares.sharedWithUserId)).where(eq(leadShares.leadId, leadId)).orderBy(asc(users.name)),
    db.select({ id: leadGroups.id, name: leadGroups.name, ownerId: leadGroups.ownerId }).from(leadGroupMembers).innerJoin(leadGroups, eq(leadGroups.id, leadGroupMembers.groupId)).where(eq(leadGroupMembers.leadId, leadId)).orderBy(asc(leadGroups.name)),
  ]);
  return { shares, groups };
}

export async function getLead(leadId: number, viewer?: { userId: number; isSuperAdmin: boolean }) {
  const db = await requireDb();
  const visibility = viewer ? leadVisibilityCondition(viewer.userId, viewer.isSuperAdmin) : undefined;
  const lead = (await db.select().from(leads).where(and(eq(leads.id, leadId), visibility)).limit(1))[0];
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
  return {
    lead,
    documents,
    communications: contactHistory,
    auditEvents: auditHistory.map(event => event.actorId === SYSTEM_ADMIN_ACTOR_ID
      ? { ...event, actorName: "Super Administrator", actorEmail: null }
      : event),
  };
}

export async function findDuplicateLead(input: LeadIdentityInput, excludeLeadId?: number) {
  const db = await requireDb();
  const keys = buildLeadIdentityKeys(input);
  if (!keys.length) return null;
  const conditions = [inArray(leadIdentityKeys.keyHash, keys.map(key => key.keyHash))];
  if (excludeLeadId) conditions.push(ne(leadIdentityKeys.leadId, excludeLeadId));
  const matches = await db
    .select({ leadId: leads.id, firstName: leads.firstName, lastName: leads.lastName, keyType: leadIdentityKeys.keyType })
    .from(leadIdentityKeys)
    .innerJoin(leads, eq(leadIdentityKeys.leadId, leads.id))
    .where(and(...conditions))
    .limit(3);
  if (!matches.length) return null;
  const first = matches[0];
  return {
    leadId: first.leadId,
    firstName: first.firstName,
    lastName: first.lastName,
    matchedBy: identityMatchLabels(keys.filter(key => matches.some(match => match.keyType === key.keyType))),
  };
}

export async function findExistingLeadIdentityMatches(inputs: LeadIdentityInput[]) {
  const db = await requireDb();
  const hashes = Array.from(new Set(inputs.flatMap(input => buildLeadIdentityKeys(input).map(key => key.keyHash))));
  if (!hashes.length) return [];
  return db
    .select({
      leadId: leads.id,
      firstName: leads.firstName,
      lastName: leads.lastName,
      keyType: leadIdentityKeys.keyType,
      keyHash: leadIdentityKeys.keyHash,
    })
    .from(leadIdentityKeys)
    .innerJoin(leads, eq(leadIdentityKeys.leadId, leads.id))
    .where(inArray(leadIdentityKeys.keyHash, hashes));
}

async function replaceLeadIdentityKeys(tx: any, leadId: number, input: Partial<InsertLead>) {
  const keys = buildLeadIdentityKeys(input);
  await tx.delete(leadIdentityKeys).where(eq(leadIdentityKeys.leadId, leadId));
  if (keys.length) await tx.insert(leadIdentityKeys).values(keys.map(key => ({ leadId, ...key })));
}

async function syncFollowUpReminder(tx: any, lead: Lead) {
  await tx.delete(followUpReminders).where(and(eq(followUpReminders.leadId, lead.id), isNull(followUpReminders.staffSentAt), isNull(followUpReminders.leadSentAt)));
  if (!lead.nextFollowUpAt) return;
  const recipientUserId = lead.assignedTo ?? (lead.createdBy > 0 ? lead.createdBy : SYSTEM_ADMIN_ACTOR_ID);
  await tx.insert(followUpReminders).values({
    leadId: lead.id,
    recipientUserId,
    scheduledFor: lead.nextFollowUpAt,
    remindAt: lead.nextFollowUpAt - 2 * 60 * 60 * 1000,
    staffEmailStatus: recipientUserId > 0 ? "pending" : "skipped",
    leadEmailStatus: lead.email ? "pending" : "skipped",
  }).onDuplicateKeyUpdate({ set: { remindAt: lead.nextFollowUpAt - 2 * 60 * 60 * 1000 } });
}

export async function backfillFollowUpReminders() {
  const db = await requireDb();
  const rows = await db.select().from(leads).where(isNotNull(leads.nextFollowUpAt));
  for (const lead of rows) await db.transaction(tx => syncFollowUpReminder(tx, lead));
}

export async function listFollowUpNotifications(viewer: { userId: number; isSuperAdmin: boolean }) {
  const db = await requireDb();
  const visibility = viewer.isSuperAdmin ? undefined : eq(followUpReminders.recipientUserId, viewer.userId);
  return db.select({
    id: followUpReminders.id,
    leadId: leads.id,
    firstName: leads.firstName,
    lastName: leads.lastName,
    stateCode: leads.stateCode,
    diagnosisCategory: leads.diagnosisCategory,
    scheduledFor: followUpReminders.scheduledFor,
    remindAt: followUpReminders.remindAt,
    readAt: followUpReminders.readAt,
    staffEmailStatus: followUpReminders.staffEmailStatus,
    leadEmailStatus: followUpReminders.leadEmailStatus,
  }).from(followUpReminders).innerJoin(leads, eq(leads.id, followUpReminders.leadId)).where(and(visibility, eq(followUpReminders.scheduledFor, leads.nextFollowUpAt))).orderBy(asc(followUpReminders.scheduledFor)).limit(200);
}

export async function markFollowUpReminderRead(id: number, viewer: { userId: number; isSuperAdmin: boolean }) {
  const db = await requireDb();
  const ownership = viewer.isSuperAdmin ? eq(followUpReminders.id, id) : and(eq(followUpReminders.id, id), eq(followUpReminders.recipientUserId, viewer.userId));
  await db.update(followUpReminders).set({ readAt: Date.now() }).where(ownership);
}

export async function getScheduledJobByTaskUid(taskUid: string) {
  const db = await requireDb();
  return (await db.select().from(scheduledJobs).where(eq(scheduledJobs.taskUid, taskUid)).limit(1))[0];
}

export async function getScheduledJobByKey(jobKey: string) {
  const db = await requireDb();
  return (await db.select().from(scheduledJobs).where(eq(scheduledJobs.jobKey, jobKey)).limit(1))[0];
}

export async function saveScheduledJob(jobKey: string, taskUid: string) {
  const db = await requireDb();
  await db.insert(scheduledJobs).values({ jobKey, taskUid }).onDuplicateKeyUpdate({ set: { taskUid } });
}

export async function getDueFollowUpReminderDeliveries(now: number) {
  const db = await requireDb();
  return db.select({
    id: followUpReminders.id,
    leadId: leads.id,
    firstName: leads.firstName,
    lastName: leads.lastName,
    leadEmail: leads.email,
    stateCode: leads.stateCode,
    scheduledFor: followUpReminders.scheduledFor,
    recipientUserId: followUpReminders.recipientUserId,
    staffName: users.name,
    staffEmail: users.email,
    preferredLanguage: staffPermissions.preferredLanguage,
    staffEmailStatus: followUpReminders.staffEmailStatus,
    leadEmailStatus: followUpReminders.leadEmailStatus,
    attempts: followUpReminders.attempts,
  }).from(followUpReminders)
    .innerJoin(leads, eq(leads.id, followUpReminders.leadId))
    .leftJoin(users, eq(users.id, followUpReminders.recipientUserId))
    .leftJoin(staffPermissions, eq(staffPermissions.userId, users.id))
    .where(and(
      lte(followUpReminders.remindAt, now),
      gte(followUpReminders.scheduledFor, now - 24 * 60 * 60 * 1000),
      eq(followUpReminders.scheduledFor, leads.nextFollowUpAt),
      lt(followUpReminders.attempts, 3),
      or(eq(followUpReminders.staffEmailStatus, "pending"), eq(followUpReminders.staffEmailStatus, "failed"), eq(followUpReminders.leadEmailStatus, "pending"), eq(followUpReminders.leadEmailStatus, "failed")),
    )).limit(100);
}

export async function updateFollowUpDelivery(id: number, values: Partial<typeof followUpReminders.$inferInsert>) {
  const db = await requireDb();
  await db.update(followUpReminders).set(values).where(eq(followUpReminders.id, id));
}

export async function backfillLeadIdentityKeys() {
  const db = await requireDb();
  const existingKeyCount = await db.select({ count: sql<number>`count(*)` }).from(leadIdentityKeys);
  if (Number(existingKeyCount[0]?.count ?? 0) > 0) return;
  const existingLeads = await db.select().from(leads).orderBy(asc(leads.id));
  for (const lead of existingLeads) {
    const keys = buildLeadIdentityKeys(lead);
    for (const key of keys) {
      await db.insert(leadIdentityKeys).values({ leadId: lead.id, ...key }).onDuplicateKeyUpdate({ set: { keyHash: key.keyHash } });
    }
  }
}

export async function backfillLeadStateCodes() {
  const db = await requireDb();
  const missing = await db.select().from(leads).where(isNull(leads.stateCode));
  for (const lead of missing) {
    const stateCode = inferSupportedStateCode(lead);
    if (!stateCode) continue;
    await updateLeadWithAudit(lead.id, { stateCode }, {
      actorId: SYSTEM_ADMIN_ACTOR_ID,
      action: "lead.state_inferred",
      source: "system_backfill",
      detail: `Operational state inferred from existing address data: ${stateCode}`,
    });
  }
}

export async function createLeadWithAudit(input: InsertLead, audit: { actorId: number; source: string; detail: string }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const keys = buildLeadIdentityKeys(input);
    if (keys.length) {
      const duplicate = await tx.select({ leadId: leadIdentityKeys.leadId }).from(leadIdentityKeys).where(inArray(leadIdentityKeys.keyHash, keys.map(key => key.keyHash))).limit(1);
      if (duplicate[0]) throw Object.assign(new Error("Duplicate lead"), { code: "LEAD_DUPLICATE", leadId: duplicate[0].leadId });
    }
    const result = await tx.insert(leads).values(input);
    const leadId = Number(result[0].insertId);
    if (keys.length) await tx.insert(leadIdentityKeys).values(keys.map(key => ({ leadId, ...key })));
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
    if (created.nextFollowUpAt) await syncFollowUpReminder(tx, created);
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
    const keys = buildLeadIdentityKeys(after);
    if (keys.length) {
      const duplicate = await tx.select({ leadId: leadIdentityKeys.leadId }).from(leadIdentityKeys).where(and(inArray(leadIdentityKeys.keyHash, keys.map(key => key.keyHash)), ne(leadIdentityKeys.leadId, leadId))).limit(1);
      if (duplicate[0]) throw Object.assign(new Error("Duplicate lead"), { code: "LEAD_DUPLICATE", leadId: duplicate[0].leadId });
    }
    await tx.update(leads).set(values).where(eq(leads.id, leadId));
    await replaceLeadIdentityKeys(tx, leadId, after);
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
    if (changes.some(change => change.field === "nextFollowUpAt" || change.field === "assignedTo" || change.field === "email")) await syncFollowUpReminder(tx, after);
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
    const leadUpdate = communicationLeadUpdate(input);
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
    if (input.nextFollowUpAt !== undefined) await syncFollowUpReminder(tx, after);
    return after;
  });
}

export async function addAuditEvent(input: typeof auditEvents.$inferInsert) {
  const db = await requireDb();
  await db.insert(auditEvents).values(input);
}

export async function getDashboardSummary(viewer: { userId: number; isSuperAdmin: boolean }) {
  const db = await requireDb();
  const now = Date.now();
  const visibility = leadVisibilityCondition(viewer.userId, viewer.isSuperAdmin);
  const [totals, followUps, recent] = await Promise.all([
    db.select({
      total: sql<number>`count(*)`,
      hot: sql<number>`sum(case when ${leads.interestLevel} = 'hot' then 1 else 0 end)`,
      buyers: sql<number>`sum(case when ${leads.status} = 'buyer' then 1 else 0 end)`,
    }).from(leads).where(visibility),
    db.select({ count: sql<number>`count(*)` }).from(leads).where(and(visibility, sql`${leads.nextFollowUpAt} is not null`, sql`${leads.nextFollowUpAt} <= ${now + 7 * 24 * 60 * 60 * 1000}`)),
    db.select().from(leads).where(visibility).orderBy(desc(leads.updatedAt)).limit(6),
  ]);
  return {
    total: Number(totals[0]?.total ?? 0),
    hot: Number(totals[0]?.hot ?? 0),
    buyers: Number(totals[0]?.buyers ?? 0),
    followUps: Number(followUps[0]?.count ?? 0),
    recent,
  };
}

export async function getUpcomingFollowUps(viewer: { userId: number; isSuperAdmin: boolean }) {
  const db = await requireDb();
  const visibility = leadVisibilityCondition(viewer.userId, viewer.isSuperAdmin);
  return db.select().from(leads).where(and(visibility, sql`${leads.nextFollowUpAt} is not null`)).orderBy(asc(leads.nextFollowUpAt)).limit(100);
}
