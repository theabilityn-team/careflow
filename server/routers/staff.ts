import { createHash, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { DEFAULT_TECHNICAL_PERMISSIONS, normalizePermissions, PERMISSION_KEYS } from "../permissions";
import { createLoginSession, hashPassword } from "../auth";

const permissionShape = Object.fromEntries(PERMISSION_KEYS.map(key => [key, z.boolean()])) as Record<(typeof PERMISSION_KEYS)[number], z.ZodBoolean>;
const permissionsSchema = z.object(permissionShape);
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export const staffRouter = router({
  list: adminProcedure.query(async () => {
    const rows = await db.listStaff();
    return rows.map(row => ({
      ...row,
      accessRole: row.role === "admin" ? "super_admin" : "technical_staff",
      jobTitle: row.role === "admin" ? "Super Administrator" : row.jobTitle ?? "Technical Staff",
      isActive: row.role === "admin" ? true : row.isActive ?? false,
      permissions: row.role === "admin" ? normalizePermissions(Object.fromEntries(PERMISSION_KEYS.map(key => [key, true]))) : row.permissions ? normalizePermissions(JSON.parse(row.permissions)) : normalizePermissions({}),
    }));
  }),

  update: adminProcedure
    .input(z.object({ userId: z.number().int().positive(), jobTitle: z.string().trim().min(2).max(120), isActive: z.boolean(), permissions: permissionsSchema }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id && !input.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot deactivate your own account." });
      await db.upsertStaffPermissions({ ...input, permissions: JSON.stringify(input.permissions) });
      return { success: true };
    }),

  createInvite: adminProcedure
    .input(z.object({
      email: z.string().email().max(320),
      fullName: z.string().trim().min(2).max(160),
      jobTitle: z.string().trim().min(2).max(120),
      permissions: permissionsSchema.default(DEFAULT_TECHNICAL_PERMISSIONS),
      origin: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      const token = randomBytes(24).toString("hex");
      await db.createStaffInvite({
        email: input.email.toLowerCase(),
        fullName: input.fullName,
        jobTitle: input.jobTitle,
        permissions: JSON.stringify(input.permissions),
        tokenHash: tokenHash(token),
        createdBy: ctx.user.id,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      return { inviteUrl: `${input.origin}/invite/${token}` };
    }),

  invites: adminProcedure.query(async () => db.listStaffInvites()),

  inspectInvite: publicProcedure.input(z.object({ token: z.string().length(48) })).query(async ({ input }) => {
    const invite = await db.getInviteByHash(tokenHash(input.token));
    if (!invite || invite.status !== "pending" || invite.expiresAt < Date.now()) return null;
    return { fullName: invite.fullName, email: invite.email, jobTitle: invite.jobTitle, expiresAt: invite.expiresAt };
  }),

  acceptInvite: publicProcedure.input(z.object({
    token: z.string().length(48),
    password: z.string().min(10).max(200).regex(/[A-Z]/, "Add an uppercase letter").regex(/[a-z]/, "Add a lowercase letter").regex(/[0-9]/, "Add a number"),
  })).mutation(async ({ ctx, input }) => {
    const invite = await db.getInviteByHash(tokenHash(input.token));
    if (!invite || invite.status !== "pending") throw new TRPCError({ code: "NOT_FOUND", message: "This invitation is no longer available." });
    if (invite.expiresAt < Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has expired." });
    if (await db.getLocalCredential(invite.email)) throw new TRPCError({ code: "CONFLICT", message: "An account already exists for this email." });
    const { salt, hash } = await hashPassword(input.password);
    const userId = await db.createInvitedStaff({
      inviteId: invite.id,
      openId: `local:${randomBytes(16).toString("hex")}`,
      name: invite.fullName,
      email: invite.email,
      identifier: invite.email,
      passwordHash: hash,
      passwordSalt: salt,
      jobTitle: invite.jobTitle,
      permissions: invite.permissions,
    });
    await createLoginSession(ctx.res, ctx.req, userId);
    return { success: true };
  }),
});
