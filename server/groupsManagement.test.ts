import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";

const now = new Date("2026-09-19T00:00:00Z");
const staff = { id: 17, openId: "staff:17", name: "Owner Staff", email: "owner@example.com", loginMethod: "local", role: "user" as const, createdAt: now, updatedAt: now, lastSignedIn: now };
const sharedStaff = { ...staff, id: 18, openId: "staff:18", name: "Shared Staff", email: "shared@example.com" };
const admin = { id: 1, openId: "system:admin", name: "Super Administrator", email: "admin@example.com", loginMethod: "system", role: "admin" as const, createdAt: now, updatedAt: now, lastSignedIn: now };
const permissions = { userId: 17, jobTitle: "Technical Staff", isActive: true, permissions: JSON.stringify({ viewLeads: true, createLeads: true, editLeads: true, scanDocuments: false, viewClinical: false, manageContacts: true, changeStatus: true, exportData: false }) };
const sharedPermissions = { ...permissions, userId: 18 };

function context(user: typeof staff | typeof sharedStaff | typeof admin | null): TrpcContext {
  return { user, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function visibleGroup(ownerId = staff.id) {
  return {
    group: { id: 44, name: "Priority leads", description: "Follow-up queue", ownerId, createdAt: now, updatedAt: now },
    ownerName: "Owner Staff",
    members: [],
    shares: [],
  };
}

afterEach(() => vi.restoreAllMocks());

describe("lead group management", () => {
  it("allows the staff owner to update a group and sends the trimmed payload", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    vi.spyOn(db, "canManageLeadGroup").mockResolvedValue(true);
    const update = vi.spyOn(db, "updateLeadGroup").mockResolvedValue(undefined);

    const result = await appRouter.createCaller(context(staff)).groups.update({ id: 44, name: "  Updated group  ", description: "  New description  " });

    expect(result).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith(44, { name: "Updated group", description: "New description" });
  });

  it("allows Super Admin to update and remove a group", async () => {
    const canManage = vi.spyOn(db, "canManageLeadGroup").mockResolvedValue(true);
    const update = vi.spyOn(db, "updateLeadGroup").mockResolvedValue(undefined);
    const getGroup = vi.spyOn(db, "getLeadGroup").mockResolvedValue(visibleGroup());
    const remove = vi.spyOn(db, "removeLeadGroup").mockResolvedValue({ detachedLeadIds: [101, 102] });

    await expect(appRouter.createCaller(context(admin)).groups.update({ id: 44, name: "Admin update", description: null })).resolves.toEqual({ success: true });
    await expect(appRouter.createCaller(context(admin)).groups.remove({ id: 44 })).resolves.toEqual({ success: true });

    expect(canManage).toHaveBeenCalledWith(44, admin.id, true);
    expect(update).toHaveBeenCalledWith(44, { name: "Admin update", description: null });
    expect(getGroup).toHaveBeenCalledWith(44, { userId: admin.id, isSuperAdmin: true });
    expect(remove).toHaveBeenCalledWith(44, admin.id);
  });

  it("allows the staff owner to remove a group", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    vi.spyOn(db, "getLeadGroup").mockResolvedValue(visibleGroup());
    vi.spyOn(db, "canManageLeadGroup").mockResolvedValue(true);
    const remove = vi.spyOn(db, "removeLeadGroup").mockResolvedValue({ detachedLeadIds: [101] });

    await expect(appRouter.createCaller(context(staff)).groups.remove({ id: 44 })).resolves.toEqual({ success: true });
    expect(remove).toHaveBeenCalledWith(44, staff.id);
  });

  it("forbids a shared non-owner from removing a group", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(sharedPermissions);
    vi.spyOn(db, "getLeadGroup").mockResolvedValue(visibleGroup());
    const canManage = vi.spyOn(db, "canManageLeadGroup").mockResolvedValue(false);
    const remove = vi.spyOn(db, "removeLeadGroup");

    await expect(appRouter.createCaller(context(sharedStaff)).groups.remove({ id: 44 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(canManage).toHaveBeenCalledWith(44, sharedStaff.id, false);
    expect(remove).not.toHaveBeenCalled();
  });

  it("forbids anonymous users before touching group data", async () => {
    const getGroup = vi.spyOn(db, "getLeadGroup");
    const remove = vi.spyOn(db, "removeLeadGroup");

    await expect(appRouter.createCaller(context(null)).groups.remove({ id: 44 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(getGroup).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for a group that is not visible and does not remove it", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    vi.spyOn(db, "getLeadGroup").mockResolvedValue(null);
    const remove = vi.spyOn(db, "removeLeadGroup");

    await expect(appRouter.createCaller(context(staff)).groups.remove({ id: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects invalid group update input", async () => {
    const update = vi.spyOn(db, "updateLeadGroup");

    await expect(appRouter.createCaller(context(admin)).groups.update({ id: 44, name: "x", description: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(update).not.toHaveBeenCalled();
  });

  it("propagates update and remove database errors", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    vi.spyOn(db, "canManageLeadGroup").mockResolvedValue(true);
    vi.spyOn(db, "updateLeadGroup").mockRejectedValue(new Error("update failed"));
    await expect(appRouter.createCaller(context(staff)).groups.update({ id: 44, name: "Valid name", description: null })).rejects.toThrow("update failed");

    vi.restoreAllMocks();
    vi.spyOn(db, "getLeadGroup").mockResolvedValue(visibleGroup());
    vi.spyOn(db, "canManageLeadGroup").mockResolvedValue(true);
    vi.spyOn(db, "removeLeadGroup").mockRejectedValue(new Error("remove failed"));
    await expect(appRouter.createCaller(context(admin)).groups.remove({ id: 44 })).rejects.toThrow("remove failed");
  });
});
