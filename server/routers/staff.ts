import { createHash, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { DEFAULT_TECHNICAL_PERMISSIONS, normalizePermissions, PERMISSION_KEYS } from "../permissions";
import { createLoginSession, hashPassword } from "../auth";
import { isPasswordResetUsable, staffPasswordSchema } from "../passwordSecurity";

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

  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().trim().email().max(320) }))
    .mutation(async ({ input }) => {
      await db.createPasswordResetRequest(input.email);
      return { success: true, message: "If this email belongs to a staff account, the Super Admin will see the request." } as const;
    }),

  passwordResetRequests: adminProcedure.query(async () => {
    const rows = await db.listPasswordResetRequests();
    return rows.map(({ request, staffName, isActive }) => ({ ...request, staffName, isActive: isActive ?? false }));
  }),

  preparePasswordReset: adminProcedure
    .input(z.object({ requestId: z.number().int().positive(), origin: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const token = randomBytes(24).toString("hex");
      const expiresAt = Date.now() + 60 * 60 * 1000;
      const request = await db.preparePasswordReset({
        requestId: input.requestId,
        tokenHash: tokenHash(token),
        preparedBy: ctx.user.id,
        expiresAt,
      });
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "This password reset request is no longer pending." });
      return { resetUrl: `${input.origin}/reset-password/${token}`, expiresAt };
    }),

  rejectPasswordReset: adminProcedure
    .input(z.object({ requestId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      if (!await db.rejectPasswordReset(input.requestId)) throw new TRPCError({ code: "NOT_FOUND", message: "This password reset request is no longer pending." });
      return { success: true } as const;
    }),

  inspectPasswordReset: publicProcedure
    .input(z.object({ token: z.string().length(48) }))
    .query(async ({ input }) => {
      const row = await db.getPasswordResetByHash(tokenHash(input.token));
      if (!row || !isPasswordResetUsable(row.request.status, row.request.expiresAt, Date.now())) return null;
      return { email: row.request.email, staffName: row.staffName, expiresAt: row.request.expiresAt };
    }),

  completePasswordReset: publicProcedure
    .input(z.object({
      token: z.string().length(48),
      password: staffPasswordSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const credential = await hashPassword(input.password);
      const userId = await db.completePasswordReset({ tokenHash: tokenHash(input.token), passwordHash: credential.hash, passwordSalt: credential.salt, now: Date.now() });
      if (!userId) throw new TRPCError({ code: "BAD_REQUEST", message: "This password reset link is invalid, expired, or already used." });
      await createLoginSession(ctx.res, ctx.req, userId);
      return { success: true } as const;
    }),

  inspectInvite: publicProcedure.input(z.object({ token: z.string().length(48) })).query(async ({ input }) => {
    const invite = await db.getInviteByHash(tokenHash(input.token));
    if (!invite || invite.status !== "pending" || invite.expiresAt < Date.now()) return null;
    return { fullName: invite.fullName, email: invite.email, jobTitle: invite.jobTitle, expiresAt: invite.expiresAt };
  }),

  acceptInvite: publicProcedure.input(z.object({
    token: z.string().length(48),
    password: staffPasswordSchema,
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
