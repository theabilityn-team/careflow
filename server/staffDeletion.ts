import { and, eq, inArray, or, sql } from "drizzle-orm";
import {
  auditEvents,
  authSessions,
  impersonationSessions,
  localCredentials,
  passwordResetRequests,
  staffInvites,
  staffPermissions,
  staffSmtpSettings,
  users,
} from "../drizzle/schema";
import { normalizePermissions } from "../shared/permissions";
import { enrichAuditValues } from "./auditIdentity";
import { getDb } from "./db";
import { serializeAudit } from "./leadAudit";

export type StaffDeletionErrorCode =
  | "SELF_DELETE"
  | "ADMIN_DELETE"
  | "NOT_FOUND"
  | "ALREADY_DELETED";

export class StaffDeletionError extends Error {
  readonly code: StaffDeletionErrorCode;

  constructor(code: StaffDeletionErrorCode, message: string) {
    super(message);
    this.name = "StaffDeletionError";
    this.code = code;
  }
}

type LockedStaffAccount = {
  user: typeof users.$inferSelect;
  permissions: typeof staffPermissions.$inferSelect;
};

function safePermissions(value: string | null | undefined) {
  try {
    return normalizePermissions(value ? JSON.parse(value) : {});
  } catch {
    return normalizePermissions({});
  }
}

function normalizedEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

/**
 * Tombstones a local technical-staff account without deleting its users row.
 * Authorization belongs to the caller/router; this function enforces target safety
 * and performs all account cleanup in one transaction.
 */
export async function deleteStaffAccount(input: { userId: number; actorId: number; now?: number }) {
  if (input.userId === input.actorId) {
    throw new StaffDeletionError("SELF_DELETE", "You cannot delete your own staff account.");
  }

  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  return db.transaction(async (tx: any) => {
    const user = (await tx
      .select()
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1)
      .for("update"))[0] as typeof users.$inferSelect | undefined;

    if (!user) {
      throw new StaffDeletionError("NOT_FOUND", "Technical staff account not found.");
    }
    if (user.role !== "user") {
      throw new StaffDeletionError("ADMIN_DELETE", "The Super Admin account cannot be deleted.");
    }

    const permissions = (await tx
      .select()
      .from(staffPermissions)
      .where(eq(staffPermissions.userId, input.userId))
      .limit(1)
      .for("update"))[0] as typeof staffPermissions.$inferSelect | undefined;

    if (!permissions) {
      throw new StaffDeletionError("NOT_FOUND", "Technical staff account not found.");
    }
    if (permissions.deletedAt != null) {
      throw new StaffDeletionError("ALREADY_DELETED", "This staff account has already been deleted.");
    }

    const now = input.now ?? Date.now();
    const beforePermissions = safePermissions(permissions.permissions);
    const email = normalizedEmail(user.email);
    const snapshotBefore = {
      userId: user.id,
      fullName: user.name,
      email: user.email,
      role: user.role,
      jobTitle: permissions.jobTitle,
      isActive: permissions.isActive,
      permissions: beforePermissions,
    };
    const afterPermissions = normalizePermissions({});

    await tx.update(staffPermissions).set({
      isActive: false,
      permissions: JSON.stringify(afterPermissions),
      deletedAt: now,
    }).where(eq(staffPermissions.userId, input.userId));

    await tx.delete(localCredentials).where(eq(localCredentials.userId, input.userId));
    await tx.delete(authSessions).where(eq(authSessions.userId, input.userId));
    await tx.delete(staffSmtpSettings).where(eq(staffSmtpSettings.userId, input.userId));
    await tx.delete(impersonationSessions).where(or(
      eq(impersonationSessions.actorUserId, input.userId),
      eq(impersonationSessions.targetUserId, input.userId),
    ));

    await tx.update(passwordResetRequests).set({
      status: "expired",
      tokenHash: null,
      expiresAt: null,
    }).where(and(
      or(
        eq(passwordResetRequests.userId, input.userId),
        email ? eq(sql`lower(trim(${passwordResetRequests.email}))`, email) : sql`1 = 0`,
      ),
      inArray(passwordResetRequests.status, ["pending", "ready"]),
    ));

    if (email) {
      await tx.update(staffInvites).set({ status: "revoked" }).where(and(
        eq(sql`lower(trim(${staffInvites.email}))`, email),
        eq(staffInvites.status, "pending"),
      ));
    }

    await tx.update(users).set({ email: null }).where(eq(users.id, input.userId));

    await tx.insert(auditEvents).values(enrichAuditValues({
      leadId: null,
      actorId: input.actorId,
      action: "staff.account_deleted",
      source: "staff",
      detail: `Deleted technical staff account ${input.userId}.`,
      changes: serializeAudit({
        userId: input.userId,
        emailCleared: Boolean(email),
        credentialsRevoked: true,
        smtpProfileDeleted: true,
        deletedAt: now,
      }),
      snapshotBefore: serializeAudit(snapshotBefore),
      snapshotAfter: serializeAudit({
        userId: input.userId,
        fullName: user.name,
        email: null,
        role: user.role,
        jobTitle: permissions.jobTitle,
        isActive: false,
        permissions: afterPermissions,
        deletedAt: now,
      }),
      occurredAt: now,
    }));

    const result: { success: true; userId: number; deletedAt: number } = {
      success: true,
      userId: input.userId,
      deletedAt: now,
    };
    return result;
  });
}

export type { LockedStaffAccount };
