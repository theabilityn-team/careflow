import { and, eq } from "drizzle-orm";
import { auditEvents, impersonationSessions, localCredentials, staffPermissions, users } from "../drizzle/schema";
import * as db from "./db";

export type SafeStaffTarget = {
  id: number;
  name: string | null;
  email: string | null;
  jobTitle: string;
  isLeader: boolean;
};

async function requireDb() {
  const database = await db.getDb();
  if (!database) throw new Error("Database is not available");
  return database;
}

function parseLeaderPermissions(value: string | null | undefined): boolean | null {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value) as { manageSales?: unknown };
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed.manageSales === true;
  } catch {
    return null;
  }
}

function targetFromRow(row: {
  id: number;
  name: string | null;
  email: string | null;
  jobTitle: string;
  permissions: string;
}): SafeStaffTarget | null {
  const isLeader = parseLeaderPermissions(row.permissions);
  if (isLeader === null) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    jobTitle: row.jobTitle,
    isLeader,
  };
}

export async function getImpersonationSession(originTokenHash: string) {
  const database = await requireDb();
  return (await database.select().from(impersonationSessions)
    .where(eq(impersonationSessions.originTokenHash, originTokenHash)).limit(1))[0];
}

export async function createImpersonationSession(input: {
  originTokenHash: string;
  actorUserId: number;
  targetUserId: number;
  expiresAt: number;
}) {
  const database = await requireDb();
  await database.insert(impersonationSessions).values(input);
}

export async function deleteImpersonationSession(originTokenHash: string) {
  const database = await requireDb();
  await database.delete(impersonationSessions).where(eq(impersonationSessions.originTokenHash, originTokenHash));
}

export async function listEligibleImpersonationTargets() {
  const database = await requireDb();
  const rows = await database.select({
    id: users.id,
    name: users.name,
    email: users.email,
    jobTitle: staffPermissions.jobTitle,
    isActive: staffPermissions.isActive,
    permissions: staffPermissions.permissions,
  }).from(users)
    .innerJoin(localCredentials, eq(localCredentials.userId, users.id))
    .innerJoin(staffPermissions, eq(staffPermissions.userId, users.id))
    .where(and(eq(users.role, "user"), eq(staffPermissions.isActive, true)));

  return rows.map(targetFromRow).filter((row): row is SafeStaffTarget => row !== null);
}

export async function getEligibleImpersonationTarget(userId: number): Promise<SafeStaffTarget | null> {
  const database = await requireDb();
  const row = (await database.select({
    id: users.id,
    name: users.name,
    email: users.email,
    jobTitle: staffPermissions.jobTitle,
    isActive: staffPermissions.isActive,
    permissions: staffPermissions.permissions,
  }).from(users)
    .innerJoin(localCredentials, eq(localCredentials.userId, users.id))
    .innerJoin(staffPermissions, eq(staffPermissions.userId, users.id))
    .where(and(eq(users.id, userId), eq(users.role, "user"), eq(staffPermissions.isActive, true)))
    .limit(1))[0];

  if (!row || !row.isActive) return null;
  return targetFromRow(row);
}

export async function getStaffSnapshot(userId: number): Promise<SafeStaffTarget | null> {
  const database = await requireDb();
  const row = (await database.select({
    id: users.id,
    name: users.name,
    email: users.email,
    jobTitle: staffPermissions.jobTitle,
    isActive: staffPermissions.isActive,
    permissions: staffPermissions.permissions,
  }).from(users)
    .leftJoin(staffPermissions, eq(staffPermissions.userId, users.id))
    .where(and(eq(users.id, userId), eq(users.role, "user")))
    .limit(1))[0];

  if (!row) return null;
  const isLeader = parseLeaderPermissions(row.permissions);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    jobTitle: row.jobTitle ?? "Technical Staff",
    isLeader: isLeader === true,
  };
}

export async function createImpersonationSessionWithAudit(input: {
  originTokenHash: string;
  actorUserId: number;
  targetUserId: number;
  expiresAt: number;
  actorName: string;
  targetName: string;
}) {
  const database = await requireDb();
  await database.transaction(async tx => {
    await tx.insert(impersonationSessions).values({
      originTokenHash: input.originTokenHash,
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      expiresAt: input.expiresAt,
    });
    await tx.insert(auditEvents).values({
      leadId: null,
      actorId: input.targetUserId,
      impersonatedById: input.actorUserId,
      impersonatedByName: input.actorName.slice(0, 160),
      action: "impersonation.start",
      source: "impersonation",
      detail: "started",
      changes: null,
      snapshotBefore: null,
      snapshotAfter: JSON.stringify({
        actor: { id: input.actorUserId, name: input.actorName },
        target: { id: input.targetUserId, name: input.targetName },
      }),
      occurredAt: Date.now(),
    });
  });
}

export async function recordImpersonationAudit(input: {
  action: string;
  actorId: number;
  actorName: string;
  targetId: number;
  targetName: string;
  detail?: string;
  effectiveActorId?: number;
  impersonatedById?: number | null;
  impersonatedByName?: string | null;
}) {
  const database = await requireDb();
  await database.insert(auditEvents).values({
    leadId: null,
    actorId: input.effectiveActorId ?? input.actorId,
    impersonatedById: input.impersonatedById ?? null,
    impersonatedByName: input.impersonatedByName?.slice(0, 160) ?? null,
    action: input.action,
    source: "impersonation",
    detail: input.detail ?? null,
    changes: null,
    snapshotBefore: null,
    snapshotAfter: JSON.stringify({
      actor: { id: input.actorId, name: input.actorName },
      target: { id: input.targetId, name: input.targetName },
    }),
    occurredAt: Date.now(),
  });
}

export async function tryRecordImpersonationAudit(input: Parameters<typeof recordImpersonationAudit>[0]) {
  try {
    await recordImpersonationAudit(input);
  } catch {
    console.warn("[Impersonation] Audit write failed");
  }
}
