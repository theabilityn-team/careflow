import { COOKIE_NAME } from "../shared/const";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import * as auth from "./auth";
import * as db from "./db";
import * as impersonationDb from "./impersonationDb";
import { resolveImpersonationPrincipal, startImpersonation } from "./impersonation";

const now = new Date();
const actor: User = {
  id: 10,
  openId: "local:actor",
  name: "Leader Actor",
  email: "leader@example.invalid",
  loginMethod: "local",
  role: "user",
  createdAt: now,
  updatedAt: now,
  lastSignedIn: now,
};
const target: User = {
  id: 20,
  openId: "local:target",
  name: "Ordinary Target",
  email: "target@example.invalid",
  loginMethod: "local",
  role: "user",
  createdAt: now,
  updatedAt: now,
  lastSignedIn: now,
};
const permissionRecord = {
  userId: actor.id,
  jobTitle: "Team Leader",
  isActive: true,
  preferredLanguage: "en" as const,
  permissions: JSON.stringify({ manageSales: true }),
  createdAt: now,
  updatedAt: now,
};

function request(headers: Record<string, string> = {}) {
  return { headers } as TrpcContext["req"];
}

function context(user: User | null, headers: Record<string, string> = {}): TrpcContext {
  return { user, req: request(headers), res: {} as TrpcContext["res"] };
}

afterEach(() => vi.restoreAllMocks());

describe("backend impersonation security", () => {
  it("fails closed when overlay state cannot be verified, without logging session material", async () => {
    vi.spyOn(db, "getAuthSession").mockResolvedValue({ user: actor, session: { id: 1, tokenHash: "private-origin-hash", userId: actor.id, expiresAt: Date.now() + 3_600_000, createdAt: now, lastUsedAt: Date.now() } });
    vi.spyOn(impersonationDb, "getImpersonationSession").mockRejectedValue(new Error("SQL private-origin-hash"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const principal = await auth.authenticateRequest(request({ cookie: `${COOKIE_NAME}=private-token` }));
    expect(principal).toBeNull();
    expect(log).toHaveBeenCalledWith("[Auth] Impersonation lookup failed");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-origin-hash");
  });

  it("binds start authority to the validated original cookie actor, not the caller principal", async () => {
    vi.spyOn(auth, "authenticateOriginalRequest").mockResolvedValue({ user: actor, tokenHash: "origin-hash", expiresAt: Date.now() + 3_600_000 });
    vi.spyOn(impersonationDb, "getImpersonationSession").mockResolvedValue(undefined);
    vi.spyOn(impersonationDb, "getEligibleImpersonationTarget").mockResolvedValue({ id: target.id, name: target.name, email: target.email, jobTitle: "Technical Staff", isLeader: false });
    vi.spyOn(impersonationDb, "createImpersonationSessionWithAudit").mockResolvedValue(undefined);
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissionRecord);

    const forgedTarget = { ...actor, id: 99, name: "Forged Admin", role: "admin" as const };
    const result = await startImpersonation({ req: request({ cookie: `${COOKIE_NAME}=present` }), actor: forgedTarget, targetUserId: target.id });

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(impersonationDb.createImpersonationSessionWithAudit).not.toHaveBeenCalled();
  });

  it("rejects nested start even when the target-mode context omits impersonation metadata", async () => {
    vi.spyOn(auth, "authenticateOriginalRequest").mockResolvedValue({ user: actor, tokenHash: "origin-hash", expiresAt: Date.now() + 3_600_000 });
    vi.spyOn(impersonationDb, "getImpersonationSession").mockResolvedValue({ id: 1, originTokenHash: "origin-hash", actorUserId: actor.id, targetUserId: target.id, expiresAt: Date.now() + 1_000, createdAt: now });
    const create = vi.spyOn(impersonationDb, "createImpersonationSessionWithAudit");

    const result = await startImpersonation({ req: request({ cookie: `${COOKIE_NAME}=present` }), actor, targetUserId: target.id });

    expect(result).toEqual({ ok: false, reason: "nested" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects stale protected workspace signatures and never treats an unauthenticated header as authority", async () => {
    const leaderContext = context(actor, { "x-careflow-workspace": "10:999" });
    await expect(appRouter.createCaller(leaderContext).impersonation.targets()).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Your account session changed. Refresh to continue.",
    });

    await expect(appRouter.createCaller(context(null, { "x-careflow-workspace": "10:0" })).impersonation.targets()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("auto-ends an overlay when the target is deactivated or promoted and restores the original actor", async () => {
    const overlay = { id: 1, originTokenHash: "origin-hash", actorUserId: actor.id, targetUserId: target.id, expiresAt: Date.now() + 3_600_000, createdAt: now };
    vi.spyOn(impersonationDb, "getImpersonationSession").mockResolvedValue(overlay);
    vi.spyOn(impersonationDb, "getEligibleImpersonationTarget").mockResolvedValue(null);
    vi.spyOn(impersonationDb, "getStaffSnapshot").mockResolvedValue({ id: target.id, name: target.name, email: target.email, jobTitle: "Technical Staff", isLeader: false });
    const remove = vi.spyOn(impersonationDb, "deleteImpersonationSession").mockResolvedValue(undefined);
    const audit = vi.spyOn(impersonationDb, "tryRecordImpersonationAudit").mockResolvedValue(undefined);
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissionRecord);

    const principal = await resolveImpersonationPrincipal({ user: actor, tokenHash: "origin-hash", expiresAt: Date.now() + 7_200_000 });

    expect(principal).toEqual(actor);
    expect(remove).toHaveBeenCalledWith("origin-hash");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "impersonation.auto_end", targetId: target.id, detail: "invalid_target" }));
  });

  it("keeps database/session material out of status, start, and stop errors", async () => {
    vi.spyOn(auth, "authenticateOriginalRequest").mockResolvedValue({ user: actor, tokenHash: "private-session-hash", expiresAt: Date.now() + 3_600_000 });
    vi.spyOn(impersonationDb, "getImpersonationSession").mockRejectedValue(new Error("SQL private-session-hash"));
    const caller = appRouter.createCaller(context(actor));
    for (const operation of [() => caller.impersonation.status(), () => caller.impersonation.start({ userId: target.id }), () => caller.impersonation.stop()]) {
      await expect(operation()).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update impersonation. Please try again.", cause: undefined });
    }
  });

  it("does not restore wider actor permissions unless auto-end deletion succeeds", async () => {
    vi.spyOn(db, "getAuthSession").mockResolvedValue({ user: actor, session: { id: 1, tokenHash: "private-origin-hash", userId: actor.id, expiresAt: Date.now() + 3_600_000, createdAt: now, lastUsedAt: Date.now() } });
    vi.spyOn(impersonationDb, "getImpersonationSession").mockResolvedValue({ id: 1, originTokenHash: "private-origin-hash", actorUserId: actor.id, targetUserId: target.id, expiresAt: Date.now() - 1, createdAt: now });
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissionRecord);
    vi.spyOn(impersonationDb, "getEligibleImpersonationTarget").mockResolvedValue(null);
    vi.spyOn(impersonationDb, "deleteImpersonationSession").mockRejectedValue(new Error("Delete failed"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await auth.authenticateRequest(request({ cookie: `${COOKIE_NAME}=private-token` }))).toBeNull();
  });
});
