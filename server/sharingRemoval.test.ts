import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";

const now = new Date("2026-10-01T00:00:00Z");
const admin = { id: 1, openId: "admin", name: "Super Admin", email: "admin@example.com", loginMethod: "system", role: "admin" as const, createdAt: now, updatedAt: now, lastSignedIn: now };
const owner = { id: 10, openId: "owner", name: "Owner", email: "owner@example.com", loginMethod: "local", role: "user" as const, createdAt: now, updatedAt: now, lastSignedIn: now };
const leader = { id: 20, openId: "leader", name: "Leader", email: "leader@example.com", loginMethod: "local", role: "user" as const, createdAt: now, updatedAt: now, lastSignedIn: now };
const inactiveLeader = { id: 21, openId: "inactive-leader", name: "Inactive Leader", email: "inactive@example.com", loginMethod: "local", role: "user" as const, createdAt: now, updatedAt: now, lastSignedIn: now };
const recipient = { id: 30, openId: "recipient", name: "Recipient", email: "recipient@example.com", loginMethod: "local", role: "user" as const, createdAt: now, updatedAt: now, lastSignedIn: now };
const foreignRecipient = { id: 40, openId: "foreign", name: "Foreign Recipient", email: "foreign@example.com", loginMethod: "local", role: "user" as const, createdAt: now, updatedAt: now, lastSignedIn: now };

const fullPermissions = JSON.stringify({ viewLeads: true, createLeads: true, editLeads: true, scanDocuments: false, viewClinical: false, manageContacts: true, changeStatus: true, exportData: false, manageSales: true });
const viewOnlyPermissions = JSON.stringify({ viewLeads: true, createLeads: false, editLeads: false, scanDocuments: false, viewClinical: false, manageContacts: false, changeStatus: false, exportData: false, manageSales: false });
const ordinaryPermissions = JSON.stringify({ viewLeads: true, createLeads: true, editLeads: true, scanDocuments: false, viewClinical: false, manageContacts: true, changeStatus: true, exportData: false, manageSales: false });
const ownerPermission = { userId: owner.id, jobTitle: "Technical Staff", isActive: true, permissions: ordinaryPermissions };
const leaderPermission = { userId: leader.id, jobTitle: "Team Lead", isActive: true, permissions: fullPermissions };
const inactiveLeaderPermission = { userId: inactiveLeader.id, jobTitle: "Team Lead", isActive: false, permissions: fullPermissions };
const recipientPermission = { userId: recipient.id, jobTitle: "Technical Staff", isActive: true, permissions: ordinaryPermissions };

function context(user: typeof admin | typeof owner | typeof leader | typeof inactiveLeader | typeof recipient | typeof foreignRecipient | null): TrpcContext {
  return { user, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function group(ownerId = owner.id) {
  return { group: { id: 44, name: "Priority leads", description: "Queue", ownerId, createdAt: now, updatedAt: now }, ownerName: "Owner", members: [], shares: [] };
}

afterEach(() => vi.restoreAllMocks());

describe("sharing removal contract", () => {
  it("gives Super Admin and active Leader global sharing capabilities while keeping group edit/delete owner-only for Leaders", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(leaderPermission);
    vi.spyOn(db, "listLeadGroups").mockResolvedValue([{ ...group().group, ownerName: "Owner", canManage: false, canManageSharing: true, createdAt: now, updatedAt: now, memberCount: 0, shareCount: 1 }]);
    vi.spyOn(db, "canManageLeadGroup").mockResolvedValue(false);
    vi.spyOn(db, "canManageLeadGroupSharing").mockResolvedValue(true);
    vi.spyOn(db, "getLeadGroup").mockResolvedValue(group());
    vi.spyOn(db, "listLeadSharing").mockResolvedValue({ shares: [{ id: 8, userId: recipient.id, name: recipient.name, email: recipient.email }], groups: [{ id: 44, name: "Priority leads", ownerId: owner.id }] });
    vi.spyOn(db, "canAccessLead").mockResolvedValue(true);
    vi.spyOn(db, "canManageLeadSharing").mockResolvedValue(true);

    const caller = appRouter.createCaller(context(leader));
    const list = await caller.groups.list();
    const get = await caller.groups.get({ id: 44 });
    const sharing = await caller.groups.leadSharing({ leadId: 99 });

    expect(list[0]).toMatchObject({ canManage: false, canManageSharing: true, canManageMembership: true });
    expect(get).toMatchObject({ canManage: false, canManageSharing: true, canManageMembership: true });
    expect(sharing).toMatchObject({ canManage: true, groups: [{ canRemove: true }] });
  });

  it("keeps inactive Leaders and ordinary foreign recipients from removing or resharing foreign objects", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(inactiveLeaderPermission);
    vi.spyOn(db, "canManageLeadGroupSharing").mockResolvedValue(false);
    vi.spyOn(db, "unshareLeadGroup");
    await expect(appRouter.createCaller(context(inactiveLeader)).groups.unshareGroup({ groupId: 44, staffId: recipient.id })).rejects.toMatchObject({ code: "FORBIDDEN" });

    vi.restoreAllMocks();
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(recipientPermission);
    vi.spyOn(db, "canManageLeadSharing").mockResolvedValue(false);
    vi.spyOn(db, "shareLead");
    await expect(appRouter.createCaller(context(recipient)).groups.shareLead({ leadId: 99, staffId: foreignRecipient.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires editLeads for group membership even for a global Leader", async () => {
    const leaderWithoutEditLeads = { ...leaderPermission, permissions: JSON.stringify({ ...JSON.parse(fullPermissions), editLeads: false }) };
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(leaderWithoutEditLeads);
    const manage = vi.spyOn(db, "canManageLeadGroupMembership");
    vi.spyOn(db, "addLeadToGroup");
    await expect(appRouter.createCaller(context(leader)).groups.addLead({ groupId: 44, leadId: 99 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(manage).not.toHaveBeenCalled();
  });

  it("allows an ordinary owner to remove a direct share and forwards the exact target and actor", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(ownerPermission);
    const canManage = vi.spyOn(db, "canManageLeadSharing").mockResolvedValue(true);
    const unshare = vi.spyOn(db, "unshareLead").mockResolvedValue({ targetExists: true, removed: true });

    await expect(appRouter.createCaller(context(owner)).groups.unshareLead({ leadId: 99, staffId: recipient.id })).resolves.toEqual({ success: true });
    expect(canManage).toHaveBeenCalledWith(99, owner.id, false, false);
    expect(unshare).toHaveBeenCalledWith(99, recipient.id, owner.id);
  });

  it("forwards the non-global permission argument for ordinary group owners", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(ownerPermission);
    const canManage = vi.spyOn(db, "canManageLeadGroupSharing").mockResolvedValue(true);
    vi.spyOn(db, "unshareLeadGroup").mockResolvedValue({ targetExists: true, removed: false });

    await expect(appRouter.createCaller(context(owner)).groups.unshareGroup({ groupId: 44, staffId: recipient.id })).resolves.toEqual({ success: true });
    expect(canManage).toHaveBeenCalledWith(44, owner.id, false);
  });

  it("forwards the effective actor for membership removal and keeps no-op removal idempotent", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(ownerPermission);
    vi.spyOn(db, "canManageLeadGroupMembership").mockResolvedValue(true);
    const remove = vi.spyOn(db, "removeLeadFromGroup").mockResolvedValue({ targetExists: true, removed: false });

    await expect(appRouter.createCaller(context(owner)).groups.removeLead({ groupId: 44, leadId: 99 })).resolves.toEqual({ success: true });
    expect(remove).toHaveBeenCalledWith(44, 99, owner.id);
  });

  it("masks membership authority and mutation failures safely", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(ownerPermission);
    vi.spyOn(db, "canManageLeadGroupMembership").mockRejectedValue(new Error("authority SQL secret"));
    await expect(appRouter.createCaller(context(owner)).groups.removeLead({ groupId: 44, leadId: 99 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Unable to verify sharing permissions safely." });

    vi.restoreAllMocks();
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(ownerPermission);
    vi.spyOn(db, "canManageLeadGroupMembership").mockResolvedValue(true);
    vi.spyOn(db, "removeLeadFromGroup").mockRejectedValue(new Error("membership SQL secret"));
    await expect(appRouter.createCaller(context(owner)).groups.removeLead({ groupId: 44, leadId: 99 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Unable to remove lead from group safely." });
  });

  it("lets a Leader remove group sharing and preserves idempotent stale-recipient success", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(leaderPermission);
    vi.spyOn(db, "canManageLeadGroupSharing").mockResolvedValue(true);
    const unshare = vi.spyOn(db, "unshareLeadGroup").mockResolvedValue({ targetExists: true, removed: false });

    await expect(appRouter.createCaller(context(leader)).groups.unshareGroup({ groupId: 44, staffId: recipient.id })).resolves.toEqual({ success: true });
    expect(unshare).toHaveBeenCalledWith(44, recipient.id, leader.id);
  });

  it("fails closed for unknown objects and masks unexpected new-operation DB errors", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(ownerPermission);
    vi.spyOn(db, "canManageLeadSharing").mockResolvedValue(true);
    vi.spyOn(db, "unshareLead").mockResolvedValue({ targetExists: false, removed: false });
    await expect(appRouter.createCaller(context(owner)).groups.unshareLead({ leadId: 999, staffId: recipient.id })).rejects.toMatchObject({ code: "NOT_FOUND" });

    vi.restoreAllMocks();
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(ownerPermission);
    vi.spyOn(db, "canManageLeadSharing").mockResolvedValue(true);
    vi.spyOn(db, "shareLead").mockRejectedValue(new Error("SQL secret"));
    await expect(appRouter.createCaller(context(owner)).groups.shareLead({ leadId: 99, staffId: recipient.id })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Unable to share this lead safely." });
  });

  it("does not expose direct shares to a recipient who can only view the lead", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue({ ...recipientPermission, permissions: viewOnlyPermissions });
    vi.spyOn(db, "canAccessLead").mockResolvedValue(true);
    vi.spyOn(db, "canManageLeadSharing").mockResolvedValue(false);
    vi.spyOn(db, "listLeadSharing").mockResolvedValue({ shares: [{ id: 8, userId: owner.id, name: owner.name, email: owner.email }], groups: [] });

    const result = await appRouter.createCaller(context(recipient)).groups.leadSharing({ leadId: 99 });
    expect(result).toEqual({ canManage: false, shares: [], groups: [] });
  });
});
