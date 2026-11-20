import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { assertPermission, hasGlobalLeadAccess } from "../permissions";
import { redactLeadFields } from "../leadFieldAccess";
import { protectedProcedure, router } from "../_core/trpc";

const id = z.number().int().positive();

type GroupAccess = Awaited<ReturnType<typeof assertPermission>>;

function groupViewer(userId: number, access: GroupAccess) {
  return {
    userId,
    isSuperAdmin: access.role === "super_admin",
    ...(access.role !== "super_admin" && access.isLeader ? { canManageAllSharing: true } : {}),
  };
}

function globalSharingAccess(access: GroupAccess) {
  return hasGlobalLeadAccess(access);
}

function canManageMembership(access: GroupAccess, ownerId: number, userId: number) {
  return Boolean(access.permissions.editLeads && (ownerId === userId || globalSharingAccess(access)));
}

function canRemoveGroupMembership(access: GroupAccess, ownerId: number, userId: number) {
  return canManageMembership(access, ownerId, userId);
}

function safeMutationError(message: string) {
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}

async function requireSharingAuthority(check: () => Promise<boolean>, message: string) {
  try {
    if (!await check()) throw new TRPCError({ code: "FORBIDDEN", message });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw safeMutationError("Unable to verify sharing permissions safely.");
  }
}

export const groupsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    const groups = await db.listLeadGroups(groupViewer(ctx.user.id, access));
    return groups.map(group => ({
      ...group,
      canManageMembership: canManageMembership(access, group.ownerId, ctx.user.id),
    }));
  }),

  get: protectedProcedure.input(z.object({ id })).query(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    const group = await db.getLeadGroup(input.id, groupViewer(ctx.user.id, access));
    if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Lead group not found." });
    const canManage = await db.canManageLeadGroup(input.id, ctx.user.id, access.role === "super_admin");
    const canManageSharing = await db.canManageLeadGroupSharing(input.id, ctx.user.id, globalSharingAccess(access));
    const canManageMembershipValue = Boolean(access.permissions.editLeads && (canManageSharing || group.group.ownerId === ctx.user.id));
    const result = { ...group, canManage, canManageSharing, canManageMembership: canManageMembershipValue };
    return { ...result, members: group.members.map(item => ({ ...item, lead: redactLeadFields(item.lead, access) })) };
  }),

  create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(160), description: z.string().trim().max(2000).optional().nullable() })).mutation(async ({ ctx, input }) => {
    await assertPermission(ctx.user, "viewLeads");
    const groupId = await db.createLeadGroup({ ...input, ownerId: ctx.user.id });
    return { id: groupId };
  }),

  update: protectedProcedure.input(z.object({ id, name: z.string().trim().min(2).max(160), description: z.string().trim().max(2000).optional().nullable() })).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    if (!await db.canManageLeadGroup(input.id, ctx.user.id, access.role === "super_admin")) throw new TRPCError({ code: "FORBIDDEN", message: "Only the group owner or Super Admin can edit this group." });
    await db.updateLeadGroup(input.id, { name: input.name, description: input.description });
    return { success: true } as const;
  }),

  remove: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    const visibleGroup = await db.getLeadGroup(input.id, groupViewer(ctx.user.id, access));
    if (!visibleGroup) throw new TRPCError({ code: "NOT_FOUND", message: "Lead group not found." });
    if (!await db.canManageLeadGroup(input.id, ctx.user.id, access.role === "super_admin")) throw new TRPCError({ code: "FORBIDDEN", message: "Only the group owner or Super Admin can remove this group." });
    const removed = await db.removeLeadGroup(input.id, ctx.user.id);
    if (!removed) throw new TRPCError({ code: "NOT_FOUND", message: "Lead group not found." });
    return { success: true } as const;
  }),

  addLead: protectedProcedure.input(z.object({ groupId: id, leadId: id })).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "editLeads");
    const global = globalSharingAccess(access);
    if (!await db.canManageLeadGroupMembership(input.groupId, ctx.user.id, global)) throw new TRPCError({ code: "FORBIDDEN", message: "Only the group owner, active Leader, or Super Admin can manage group membership." });
    if (!await db.canAccessLead(input.leadId, ctx.user.id, global)) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
    const added = await db.addLeadToGroup({ ...input, addedBy: ctx.user.id });
    if (added === false) throw new TRPCError({ code: "NOT_FOUND", message: "Lead group or lead not found." });
    await db.addAuditEvent({ leadId: input.leadId, actorId: ctx.user.id, action: "lead.group_added", source: "sharing", detail: `Added to lead group #${input.groupId}`, occurredAt: Date.now() });
    return { success: true } as const;
  }),

  removeLead: protectedProcedure.input(z.object({ groupId: id, leadId: id })).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "editLeads");
    const global = globalSharingAccess(access);
    await requireSharingAuthority(
      () => db.canManageLeadGroupMembership(input.groupId, ctx.user.id, global),
      "Only the group owner, active Leader, or Super Admin can manage group membership.",
    );
    try {
      const removed = await db.removeLeadFromGroup(input.groupId, input.leadId, ctx.user.id);
      if (removed && removed.targetExists === false) throw new TRPCError({ code: "NOT_FOUND", message: "Lead group or lead not found." });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw safeMutationError("Unable to remove lead from group safely.");
    }
    return { success: true } as const;
  }),

  shareGroup: protectedProcedure.input(z.object({ groupId: id, staffId: id })).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    const global = globalSharingAccess(access);
    await requireSharingAuthority(
      () => db.canManageLeadGroupSharing(input.groupId, ctx.user.id, global),
      "Only the group owner, active Leader, or Super Admin can share this group.",
    );
    if (input.staffId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You already own this group." });
    try {
      const shared = await db.shareLeadGroup({ groupId: input.groupId, sharedWithUserId: input.staffId, sharedByUserId: ctx.user.id });
      if (shared === false) throw new TRPCError({ code: "BAD_REQUEST", message: "Sharing requires an active local staff recipient who is not the owner." });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw safeMutationError("Unable to share this group safely.");
    }
    return { success: true } as const;
  }),

  unshareGroup: protectedProcedure.input(z.object({ groupId: id, staffId: id })).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    const global = globalSharingAccess(access);
    await requireSharingAuthority(
      () => db.canManageLeadGroupSharing(input.groupId, ctx.user.id, global),
      "Only the group owner, active Leader, or Super Admin can change sharing.",
    );
    try {
      const result = await db.unshareLeadGroup(input.groupId, input.staffId, ctx.user.id);
      if (result?.targetExists === false) throw new TRPCError({ code: "NOT_FOUND", message: "Lead group not found." });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw safeMutationError("Unable to remove group sharing safely.");
    }
    return { success: true } as const;
  }),

  leadSharing: protectedProcedure.input(z.object({ leadId: id })).query(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    const global = globalSharingAccess(access);
    if (!await db.canAccessLead(input.leadId, ctx.user.id, global)) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
    const canManage = await db.canManageLeadSharing(input.leadId, ctx.user.id, access.role === "super_admin", global);
    const sharing = await db.listLeadSharing(input.leadId);
    const groups = sharing.groups.map(group => ({ ...group, canRemove: Boolean(access.permissions.editLeads && (group.ownerId === ctx.user.id || global)) }));
    return { canManage, shares: canManage ? sharing.shares : [], groups };
  }),

  shareLead: protectedProcedure.input(z.object({ leadId: id, staffId: id })).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    const global = globalSharingAccess(access);
    await requireSharingAuthority(
      () => db.canManageLeadSharing(input.leadId, ctx.user.id, access.role === "super_admin", global),
      "Only the lead creator, active Leader, or Super Admin can share this lead.",
    );
    if (input.staffId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You already own this lead." });
    try {
      const shared = await db.shareLead({ leadId: input.leadId, sharedWithUserId: input.staffId, sharedByUserId: ctx.user.id });
      if (shared === false) throw new TRPCError({ code: "BAD_REQUEST", message: "Sharing requires an active local staff recipient who is not the lead owner." });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw safeMutationError("Unable to share this lead safely.");
    }
    return { success: true } as const;
  }),

  unshareLead: protectedProcedure.input(z.object({ leadId: id, staffId: id })).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    const global = globalSharingAccess(access);
    await requireSharingAuthority(
      () => db.canManageLeadSharing(input.leadId, ctx.user.id, access.role === "super_admin", global),
      "Only the lead creator, active Leader, or Super Admin can change sharing.",
    );
    try {
      const result = await db.unshareLead(input.leadId, input.staffId, ctx.user.id);
      if (result?.targetExists === false) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw safeMutationError("Unable to remove direct sharing safely.");
    }
    return { success: true } as const;
  }),
});
