import type { Request } from "express";
import type { User } from "../drizzle/schema";
import { SUPER_ADMIN_EMAIL, SYSTEM_ADMIN_ACTOR_ID } from "@shared/const";
import { authenticateOriginalRequest, getSessionToken, hashToken } from "./auth";
import * as db from "./db";
import {
  createImpersonationSessionWithAudit,
  deleteImpersonationSession,
  getEligibleImpersonationTarget,
  getImpersonationSession,
  getStaffSnapshot,
  listEligibleImpersonationTargets,
  tryRecordImpersonationAudit,
  type SafeStaffTarget,
} from "./impersonationDb";
import { getUserAccess } from "./permissions";

export type ImpersonationMetadata = {
  actor: { id: number; name: string; email: string | null };
  target: { id: number; name: string; email: string | null };
  expiresAt: number;
};

export type AuthenticatedPrincipal = User & { impersonation?: ImpersonationMetadata };
export type OriginalSession = { user: User; tokenHash: string; expiresAt: number };

const OVERLAY_TTL_MS = 60 * 60 * 1000;

function safeName(user: { name: string | null }): string {
  return user.name?.trim() || "Unnamed staff member";
}

function safeEmail(user: { email: string | null }): string | null {
  return user.email ?? null;
}

function principalWithMetadata(target: User, actor: User, expiresAt: number): AuthenticatedPrincipal {
  return {
    ...target,
    impersonation: {
      actor: { id: actor.id, name: safeName(actor), email: safeEmail(actor) },
      target: { id: target.id, name: safeName(target), email: safeEmail(target) },
      expiresAt,
    },
  };
}

async function activeCapability(user: User) {
  const access = await getUserAccess(user);
  return { access, canAct: user.role === "admin" || access.isActive };
}

async function validTarget(targetUserId: number) {
  return getEligibleImpersonationTarget(targetUserId);
}

function syntheticSystemAdmin(): User {
  const now = new Date();
  return {
    id: SYSTEM_ADMIN_ACTOR_ID,
    openId: "system:super-admin",
    name: "Super Administrator",
    email: SUPER_ADMIN_EMAIL,
    loginMethod: "system",
    role: "admin",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

function auditTarget(snapshot: SafeStaffTarget | null, targetId: number): { id: number; name: string } {
  return {
    id: snapshot?.id ?? targetId,
    name: snapshot?.name?.trim() || "Unknown staff member",
  };
}

/** Resolve an overlay only after the original cookie session has been validated. */
export async function resolveImpersonationPrincipal(original: OriginalSession): Promise<AuthenticatedPrincipal> {
  const overlay = await getImpersonationSession(original.tokenHash);
  if (!overlay) return original.user;

  const now = Date.now();
  const actorState = await activeCapability(original.user);
  const target = await validTarget(overlay.targetUserId);
  const actorMatches = overlay.actorUserId === original.user.id;
  const actorAllowed = original.user.role === "admin" || (actorState.canAct && actorState.access.isLeader);
  const targetAllowed = Boolean(target && (original.user.role === "admin" || !target.isLeader));
  const withinExpiry = overlay.expiresAt > now && overlay.expiresAt <= original.expiresAt;

  if (!actorMatches || !actorAllowed || !targetAllowed || !withinExpiry) {
    await deleteImpersonationSession(original.tokenHash);
    const snapshot = await getStaffSnapshot(overlay.targetUserId).catch(() => null);
    const safeTarget = auditTarget(snapshot, overlay.targetUserId);
    await tryRecordImpersonationAudit({
      action: "impersonation.auto_end",
      actorId: original.user.id,
      actorName: safeName(original.user),
      targetId: safeTarget.id,
      targetName: safeTarget.name,
      detail: !withinExpiry ? "expired" : !actorAllowed ? "invalid_permission" : "invalid_target",
      effectiveActorId: safeTarget.id,
      impersonatedById: original.user.id,
      impersonatedByName: safeName(original.user),
    });
    return original.user;
  }

  if (!target) return original.user;
  const targetRecord = await db.getUserById(target.id);
  if (!targetRecord || targetRecord.role !== "user") {
    await deleteImpersonationSession(original.tokenHash);
    return original.user;
  }
  return principalWithMetadata(targetRecord, original.user, overlay.expiresAt);
}

export async function getCurrentImpersonation(req: Request, original: OriginalSession | null) {
  if (!original) return null;
  const overlay = await getImpersonationSession(original.tokenHash);
  if (!overlay) return null;
  const principal = await resolveImpersonationPrincipal(original);
  return principal.impersonation ?? null;
}

export async function listTargetsForActor(actor: User) {
  const capability = await activeCapability(actor);
  if (actor.role !== "admin" && (!capability.canAct || !capability.access.isLeader)) return [];
  const targets = await listEligibleImpersonationTargets();
  return targets
    .filter(target => target.id !== actor.id)
    .filter(target => actor.role === "admin" || !target.isLeader)
    .map(target => ({
      id: target.id,
      name: target.name,
      email: target.email,
      jobTitle: target.jobTitle,
      isLeader: target.isLeader,
    }));
}

export async function startImpersonation(input: { req: Request; actor: User; targetUserId: number }) {
  const original = await authenticateOriginalRequest(input.req);
  if (!original) return { ok: false as const, reason: "unauthorized" as const };

  const existing = await getImpersonationSession(original.tokenHash);
  if (existing) return { ok: false as const, reason: "nested" as const };

  // The request principal is advisory only; the original cookie session is authoritative.
  if (input.actor.id !== original.user.id || input.actor.role !== original.user.role) {
    return { ok: false as const, reason: "forbidden" as const };
  }

  const actor = original.user;
  const capability = await activeCapability(actor);
  if (actor.role !== "admin" && (!capability.canAct || !capability.access.isLeader)) {
    return { ok: false as const, reason: "forbidden" as const };
  }

  const target = await validTarget(input.targetUserId);
  if (!target || target.id === actor.id || (actor.role !== "admin" && target.isLeader)) {
    return { ok: false as const, reason: "forbidden" as const };
  }

  const expiresAt = Math.min(Date.now() + OVERLAY_TTL_MS, original.expiresAt);
  try {
    await createImpersonationSessionWithAudit({
      originTokenHash: original.tokenHash,
      actorUserId: actor.id,
      targetUserId: target.id,
      expiresAt,
      actorName: safeName(actor),
      targetName: target.name?.trim() || "Unnamed staff member",
    });
  } catch {
    // Duplicate/concurrent starts and audit failures are intentionally indistinguishable.
    return { ok: false as const, reason: "conflict" as const };
  }
  return { ok: true as const };
}

export async function stopImpersonation(req: Request) {
  const original = await authenticateOriginalRequest(req);
  if (!original) return { ok: false as const, reason: "unauthorized" as const };

  const overlay = await getImpersonationSession(original.tokenHash);
  if (!overlay) return { ok: true as const };

  const actor = original.user;
  const snapshot = await getStaffSnapshot(overlay.targetUserId).catch(() => null);
  const safeTarget = auditTarget(snapshot, overlay.targetUserId);
  // Delete first so an audit outage cannot prevent recovery to the original account.
  await deleteImpersonationSession(original.tokenHash);
  await tryRecordImpersonationAudit({
    action: "impersonation.stop",
    actorId: actor.id,
    actorName: safeName(actor),
    targetId: safeTarget.id,
    targetName: safeTarget.name,
    detail: "stopped",
    effectiveActorId: safeTarget.id,
    impersonatedById: actor.id,
    impersonatedByName: safeName(actor),
  });
  return { ok: true as const };
}

export function sessionTokenHash(req: Request) {
  const token = getSessionToken(req);
  return token ? hashToken(token) : null;
}
