import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { assertPermission } from "../permissions";
import { protectedProcedure, router } from "../_core/trpc";

const id = z.number().int().positive();
const viewer = (userId: number, role: string) => ({ userId, isSuperAdmin: role === "super_admin" });

export const groupsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    return db.listLeadGroups(viewer(ctx.user.id, access.role));
  }),

  get: protectedProcedure.input(z.object({ id })).query(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    const group = await db.getLeadGroup(input.id, viewer(ctx.user.id, access.role));
    if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Lead group not found." });
    const canManage = await db.canManageLeadGroup(input.id, ctx.user.id, access.role === "super_admin");
    if (access.permissions.viewClinical) return { ...group, canManage };
    return { ...group, canManage, members: group.members.map(item => ({ ...item, lead: { ...item.lead, diagnosis: null, clinicalNotes: null, additionalInformation: null } })) };
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

  addLead: protectedProcedure.input(z.object({ groupId: id, leadId: id })).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "editLeads");
    const isAdmin = access.role === "super_admin";
    if (!await db.canManageLeadGroup(input.groupId, ctx.user.id, isAdmin)) throw new TRPCError({ code: "FORBIDDEN", message: "Only the group owner or Super Admin can add leads." });
    if (!await db.canAccessLead(input.leadId, ctx.user.id, isAdmin)) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
    await db.addLeadToGroup({ ...input, addedBy: ctx.user.id });
    await db.addAuditEvent({ leadId: input.leadId, actorId: ctx.user.id, action: "lead.group_added", source: "sharing", detail: `Added to lead group #${input.groupId}`, occurredAt: Date.now() });
    return { success: true } as const;
  }),

  removeLead: protectedProcedure.input(z.object({ groupId: id, leadId: id })).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "editLeads");
    if (!await db.canManageLeadGroup(input.groupId, ctx.user.id, access.role === "super_admin")) throw new TRPCError({ code: "FORBIDDEN", message: "Only the group owner or Super Admin can remove leads." });
    await db.removeLeadFromGroup(input.groupId, input.leadId);
    await db.addAuditEvent({ leadId: input.leadId, actorId: ctx.user.id, action: "lead.group_removed", source: "sharing", detail: `Removed from lead group #${input.groupId}`, occurredAt: Date.now() });
    return { success: true } as const;
  }),

  shareGroup: protectedProcedure.input(z.object({ groupId: id, staffId: id })).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    if (!await db.canManageLeadGroup(input.groupId, ctx.user.id, access.role === "super_admin")) throw new TRPCError({ code: "FORBIDDEN", message: "Only the group owner or Super Admin can share this group." });
    if (input.staffId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You already own this group." });
    await db.shareLeadGroup({ groupId: input.groupId, sharedWithUserId: input.staffId, sharedByUserId: ctx.user.id });
    return { success: true } as const;
  }),

  unshareGroup: protectedProcedure.input(z.object({ groupId: id, staffId: id })).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    if (!await db.canManageLeadGroup(input.groupId, ctx.user.id, access.role === "super_admin")) throw new TRPCError({ code: "FORBIDDEN", message: "Only the group owner or Super Admin can change sharing." });
    await db.unshareLeadGroup(input.groupId, input.staffId);
    return { success: true } as const;
  }),

  leadSharing: protectedProcedure.input(z.object({ leadId: id })).query(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    if (!await db.canAccessLead(input.leadId, ctx.user.id, access.role === "super_admin")) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
    const canManage = await db.canManageLeadSharing(input.leadId, ctx.user.id, access.role === "super_admin");
    const sharing = await db.listLeadSharing(input.leadId);
    return { canManage, shares: canManage ? sharing.shares : [], groups: sharing.groups };
  }),

  shareLead: protectedProcedure.input(z.object({ leadId: id, staffId: id })).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    if (!await db.canManageLeadSharing(input.leadId, ctx.user.id, access.role === "super_admin")) throw new TRPCError({ code: "FORBIDDEN", message: "Only the lead creator or Super Admin can share this lead." });
    if (input.staffId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You already own this lead." });
    await db.shareLead({ leadId: input.leadId, sharedWithUserId: input.staffId, sharedByUserId: ctx.user.id });
    await db.addAuditEvent({ leadId: input.leadId, actorId: ctx.user.id, action: "lead.shared", source: "sharing", detail: `Shared with staff #${input.staffId}`, occurredAt: Date.now() });
    return { success: true } as const;
  }),

  unshareLead: protectedProcedure.input(z.object({ leadId: id, staffId: id })).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    if (!await db.canManageLeadSharing(input.leadId, ctx.user.id, access.role === "super_admin")) throw new TRPCError({ code: "FORBIDDEN", message: "Only the lead creator or Super Admin can change sharing." });
    await db.unshareLead(input.leadId, input.staffId);
    await db.addAuditEvent({ leadId: input.leadId, actorId: ctx.user.id, action: "lead.unshared", source: "sharing", detail: `Removed access for staff #${input.staffId}`, occurredAt: Date.now() });
    return { success: true } as const;
  }),
});
