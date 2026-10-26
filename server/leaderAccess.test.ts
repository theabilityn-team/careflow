import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { assertSalesAccess, getUserAccess, hasGlobalLeadAccess } from "./permissions";
import { leadsRouter } from "./routers/leads";
import { emailSettingsRouter } from "./routers/emailSettings";
import type { TrpcContext } from "./_core/context";

const now = new Date();
const staff = { id: 17, openId: "qa:leader", name: "Leader Test", email: "leader@example.invalid", loginMethod: "local", role: "user" as const, createdAt: now, updatedAt: now, lastSignedIn: now };
const context = { user: staff, req: { headers: {} }, res: {} } as TrpcContext;
function grant(permissions: unknown, isActive = true) {
  vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue({ userId: staff.id, jobTitle: "Technical Staff", isActive, preferredLanguage: "en", permissions: typeof permissions === "string" ? permissions : JSON.stringify(permissions), createdAt: now, updatedAt: now });
}
afterEach(() => vi.restoreAllMocks());

describe("Leader sales and lead visibility", () => {
  it("enables team-wide lead viewing while retaining ordinary staff role and explicit sensitive permissions", async () => {
    grant({ manageSales: true, viewLeads: false });
    const access = await getUserAccess(staff);
    expect(access).toMatchObject({ role: "technical_staff", isLeader: true, isActive: true });
    expect(access.permissions.viewLeads).toBe(true);
    expect(access.permissions.viewClinical).toBe(false);
    expect(access.permissions.manageEmails).toBe(false);
    expect(hasGlobalLeadAccess(access)).toBe(true);
    await expect(assertSalesAccess(staff)).resolves.toMatchObject({ isLeader: true });
  });

  it("keeps ordinary staff scoped and denies all sales management", async () => {
    grant({ viewLeads: true, manageEmails: true, useEmailTemplates: true });
    expect(hasGlobalLeadAccess(await getUserAccess(staff))).toBe(false);
    await expect(assertSalesAccess(staff)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("fails closed for inactive leaders and malformed stored permissions", async () => {
    grant({ manageSales: true }, false);
    expect(hasGlobalLeadAccess(await getUserAccess(staff))).toBe(false);
    await expect(assertSalesAccess(staff)).rejects.toMatchObject({ code: "FORBIDDEN" });
    vi.restoreAllMocks();
    grant("invalid json");
    expect((await getUserAccess(staff)).isLeader).toBe(false);
    await expect(assertSalesAccess(staff)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("passes global visibility to lead queries but never opens SMTP management/testing to a leader", async () => {
    grant({ manageSales: true });
    const list = vi.spyOn(db, "listLeads").mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 });
    await leadsRouter.createCaller(context).list({ page: 1, pageSize: 25 });
    expect(list).toHaveBeenCalledWith(expect.any(Object), { userId: staff.id, isSuperAdmin: true });
    await expect(emailSettingsRouter.createCaller(context).managedAccounts()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(emailSettingsRouter.createCaller(context).testConnection()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("preserves Super Admin's global and sales access", async () => {
    const access = await getUserAccess({ ...staff, role: "admin" });
    expect(access.role).toBe("super_admin");
    expect(access.isLeader).toBe(true);
    expect(hasGlobalLeadAccess(access)).toBe(true);
  });
});
