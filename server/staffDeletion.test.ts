import { afterEach, describe, expect, it, vi } from "vitest";
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
import * as db from "./db";
import { deleteStaffAccount, StaffDeletionError } from "./staffDeletion";

const deletedAt = 1_798_000_000_000;
const actorId = 9001;
const targetId = 9002;

function user(overrides: Partial<typeof users.$inferSelect> = {}): typeof users.$inferSelect {
  return {
    id: targetId,
    openId: "local:target",
    name: "Target Staff",
    email: "target@example.com",
    loginMethod: "local",
    role: "user",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    lastSignedIn: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function permission(overrides: Partial<typeof staffPermissions.$inferSelect> = {}): typeof staffPermissions.$inferSelect {
  return {
    userId: targetId,
    jobTitle: "Technical Staff",
    isActive: true,
    preferredLanguage: "en",
    permissions: JSON.stringify({ viewLeads: true, manageSales: true }),
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

type Fixture = {
  users: typeof users.$inferSelect[];
  permissions: typeof staffPermissions.$inferSelect[];
  credentials: Array<typeof localCredentials.$inferSelect>;
  sessions: Array<typeof authSessions.$inferSelect>;
  smtp: Array<typeof staffSmtpSettings.$inferSelect>;
  resets: Array<typeof passwordResetRequests.$inferSelect>;
  invites: Array<typeof staffInvites.$inferSelect>;
  overlays: Array<typeof impersonationSessions.$inferSelect>;
  audits: Array<typeof auditEvents.$inferSelect>;
};

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    users: [user()],
    permissions: [permission()],
    credentials: [{
      userId: targetId,
      identifier: "target@example.com",
      passwordHash: "hash-that-must-never-enter-audit",
      passwordSalt: "salt-that-must-never-enter-audit",
      failedLoginCount: 0,
      lockedUntil: null,
      passwordUpdatedAt: deletedAt - 1000,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    }],
    sessions: [{ id: 1, tokenHash: "session-target", userId: targetId, expiresAt: deletedAt + 1000, createdAt: new Date(), lastUsedAt: deletedAt }],
    smtp: [{
      userId: targetId,
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpSecurity: "starttls",
      smtpUsername: "target@example.com",
      smtpPassword: "smtp-secret",
      fromEmail: "target@example.com",
      fromName: "Target Staff",
      replyToEmail: null,
      isEnabled: true,
      verifiedAt: deletedAt - 1000,
      lastTestedAt: deletedAt - 1000,
      lastTestError: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    }],
    resets: [{
      id: 1,
      userId: targetId,
      email: "target@example.com",
      tokenHash: "reset-secret",
      status: "ready",
      requestedAt: deletedAt - 2000,
      preparedBy: actorId,
      preparedAt: deletedAt - 1500,
      expiresAt: deletedAt + 1000,
      usedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    }],
    invites: [{
      id: 1,
      email: "target@example.com",
      fullName: "Pending Reinvite",
      jobTitle: "Technical Staff",
      tokenHash: "invite-secret",
      permissions: "{}",
      status: "pending",
      createdBy: actorId,
      expiresAt: deletedAt + 1000,
      acceptedBy: null,
      acceptedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    }],
    overlays: [
      { id: 1, originTokenHash: "overlay-as-actor", actorUserId: targetId, targetUserId: actorId, expiresAt: deletedAt + 1000, createdAt: new Date() },
      { id: 2, originTokenHash: "overlay-as-target", actorUserId: actorId, targetUserId: targetId, expiresAt: deletedAt + 1000, createdAt: new Date() },
      { id: 3, originTokenHash: "unrelated-overlay", actorUserId: actorId, targetUserId: 9010, expiresAt: deletedAt + 1000, createdAt: new Date() },
    ],
    audits: [],
    ...overrides,
  };
}

function installFakeDb(state: Fixture, options: { failAudit?: boolean } = {}) {
  const clone = () => structuredClone(state);
  const tableRows = (table: unknown) => {
    if (table === users) return state.users;
    if (table === staffPermissions) return state.permissions;
    if (table === localCredentials) return state.credentials;
    if (table === authSessions) return state.sessions;
    if (table === staffSmtpSettings) return state.smtp;
    if (table === passwordResetRequests) return state.resets;
    if (table === staffInvites) return state.invites;
    if (table === impersonationSessions) return state.overlays;
    if (table === auditEvents) return state.audits;
    throw new Error("Unexpected table in deletion test fixture");
  };
  const matchesTarget = (table: unknown, row: Record<string, unknown>) => {
    if (table === users || table === staffPermissions || table === localCredentials || table === staffSmtpSettings) return row.id === targetId || row.userId === targetId;
    if (table === authSessions || table === passwordResetRequests) return row.userId === targetId;
    if (table === impersonationSessions) return row.actorUserId === targetId || row.targetUserId === targetId;
    return false;
  };
  const tx = {
    select() {
      let selectedTable: unknown;
      const builder = {
        from(table: unknown) { selectedTable = table; return builder; },
        where() { return builder; },
        limit() { return builder; },
        for() {
          const rows = tableRows(selectedTable) as Array<Record<string, unknown>>;
          if (selectedTable === users) return Promise.resolve(rows.filter(row => row.id === targetId));
          if (selectedTable === staffPermissions) return Promise.resolve(rows.filter(row => row.userId === targetId));
          return Promise.resolve([]);
        },
      };
      return builder;
    },
    update(table: unknown) {
      return { set(values: Record<string, unknown>) {
        return { where: async () => {
          const rows = tableRows(table) as Array<Record<string, unknown>>;
          for (const row of rows) {
            if (matchesTarget(table, row)) Object.assign(row, values);
            if (table === staffInvites && row.status === "pending") row.status = values.status ?? row.status;
            if (table === passwordResetRequests && row.userId === targetId) Object.assign(row, values);
          }
          return { affectedRows: 1 };
        } };
      } };
    },
    delete(table: unknown) {
      return { where: async () => {
        const rows = tableRows(table) as Array<Record<string, unknown>>;
        const remaining = rows.filter(row => !matchesTarget(table, row));
        if (table === localCredentials) state.credentials = remaining as Fixture["credentials"];
        if (table === authSessions) state.sessions = remaining as Fixture["sessions"];
        if (table === staffSmtpSettings) state.smtp = remaining as Fixture["smtp"];
        if (table === impersonationSessions) state.overlays = remaining as Fixture["overlays"];
        return { affectedRows: rows.length - remaining.length };
      } };
    },
    insert(table: unknown) {
      return { values: async (value: Record<string, unknown>) => {
        if (table === auditEvents) {
          if (options.failAudit) throw new Error("simulated audit failure");
          state.audits.push(value as typeof state.audits[number]);
        }
        return { insertId: 1 };
      } };
    },
  };
  vi.spyOn(db, "getDb").mockResolvedValue({
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
      const before = clone();
      try {
        return await callback(tx);
      } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    },
  } as never);
  return state;
}

afterEach(() => vi.restoreAllMocks());

describe("deleteStaffAccount", () => {
  it("rejects self-delete, admin, missing, and already-tombstoned targets", async () => {
    await expect(deleteStaffAccount({ userId: actorId, actorId })).rejects.toMatchObject({ code: "SELF_DELETE" });

    const adminState = fixture({ users: [user({ role: "admin" })] });
    installFakeDb(adminState);
    await expect(deleteStaffAccount({ userId: targetId, actorId })).rejects.toMatchObject({ code: "ADMIN_DELETE" });

    const missingState = fixture({ users: [], permissions: [] });
    installFakeDb(missingState);
    await expect(deleteStaffAccount({ userId: targetId, actorId })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const deletedState = fixture({ permissions: [permission({ deletedAt })] });
    installFakeDb(deletedState);
    await expect(deleteStaffAccount({ userId: targetId, actorId })).rejects.toMatchObject({ code: "ALREADY_DELETED" });
  });

  it("tombstones the account, revokes secrets, and preserves historical attribution rows", async () => {
    const state = installFakeDb(fixture());
    const result = await deleteStaffAccount({ userId: targetId, actorId, now: deletedAt });

    expect(result).toEqual({ success: true, userId: targetId, deletedAt });
    expect(state.users).toHaveLength(1);
    expect(state.users[0]).toMatchObject({ id: targetId, name: "Target Staff", email: null, role: "user" });
    expect(state.permissions[0]).toMatchObject({ userId: targetId, isActive: false, deletedAt });
    expect(JSON.parse(state.permissions[0].permissions)).toEqual({
      viewLeads: false,
      createLeads: false,
      editLeads: false,
      scanDocuments: false,
      viewClinical: false,
      viewDocuments: false,
      manageContacts: false,
      manageEmails: false,
      useEmailTemplates: false,
      changeStatus: false,
      exportData: false,
      manageSales: false,
    });
    expect(state.credentials).toHaveLength(0);
    expect(state.sessions).toHaveLength(0);
    expect(state.smtp).toHaveLength(0);
    expect(state.resets[0]).toMatchObject({ status: "expired", tokenHash: null, expiresAt: null });
    expect(state.invites[0].status).toBe("revoked");
    expect(state.overlays.map(row => row.originTokenHash)).toEqual(["unrelated-overlay"]);
    expect(state.audits).toHaveLength(1);
    const audit = state.audits[0];
    expect(audit).toMatchObject({ actorId, action: "staff.account_deleted", source: "staff", occurredAt: deletedAt });
    const auditJson = JSON.stringify(audit);
    expect(auditJson).not.toContain("passwordHash");
    expect(auditJson).not.toContain("passwordSalt");
    expect(auditJson).not.toContain("smtp-secret");
    expect(auditJson).not.toContain("reset-secret");
    expect(auditJson).not.toContain("invite-secret");
  });

  it("rolls back every mutation when the audit write fails", async () => {
    const state = fixture();
    const before = structuredClone(state);
    installFakeDb(state, { failAudit: true });

    await expect(deleteStaffAccount({ userId: targetId, actorId, now: deletedAt })).rejects.toThrow("simulated audit failure");
    expect(state).toEqual(before);
  });

  it("uses the typed service error contract without exposing SQL details", async () => {
    await expect(deleteStaffAccount({ userId: actorId, actorId })).rejects.toBeInstanceOf(StaffDeletionError);
    try {
      await deleteStaffAccount({ userId: actorId, actorId });
    } catch (error) {
      expect(error).toMatchObject({ code: "SELF_DELETE" });
      expect(String(error)).not.toContain("sql");
    }
  });
});
