import { deleteStaffAccount, StaffDeletionError } from "../staffDeletion";
import { createHash, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { DEFAULT_TECHNICAL_PERMISSIONS, normalizePermissions, PERMISSION_KEYS } from "../permissions";
import { createLoginSession, hashPassword } from "../auth";
import { isPasswordResetUsable, staffPasswordSchema } from "../passwordSecurity";
import { SUPER_ADMIN_EMAIL } from "@shared/const";

const permissionShape = Object.fromEntries(PERMISSION_KEYS.map(key => [key, key === "manageSales" || key === "viewDocuments" ? z.boolean().default(false) : z.boolean()])) as Record<(typeof PERMISSION_KEYS)[number], z.ZodBoolean>;
const permissionsSchema = z.object(permissionShape);
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const normalizedEmailSchema = z.string().trim().toLowerCase().email().max(320);
const accountNameSchema = z.string().trim().min(2).max(160);

function isDuplicateError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; cause?: unknown; errno?: unknown; sqlState?: unknown };
  return value.code === "DUPLICATE_STAFF_ACCOUNT" || value.code === "ER_DUP_ENTRY" || value.errno === 1062 || isDuplicateError(value.cause);
}

function accountManagementError(error: unknown): never {
  if (isDuplicateError(error)) {
    throw new TRPCError({ code: "CONFLICT", message: "A staff account already exists for this email." });
  }
  if (error instanceof TRPCError) throw error;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The staff account could not be saved. Please try again." });
}

export const staffRouter = router({
  list: adminProcedure.query(async () => {
    const rows = await db.listStaff();
    return rows.map(row => ({
      ...row,
      accessRole: row.role === "admin" ? "super_admin" : "technical_staff",
      jobTitle: row.role === "admin" ? "Super Administrator" : row.jobTitle ?? "Technical Staff",
      isActive: row.role === "admin" ? true : row.isActive ?? false,
      isLeader: Boolean(row.isActive && row.permissions && normalizePermissions(JSON.parse(row.permissions)).manageSales),
      permissions: row.role === "admin" ? normalizePermissions(Object.fromEntries(PERMISSION_KEYS.map(key => [key, true]))) : row.permissions ? normalizePermissions(JSON.parse(row.permissions)) : normalizePermissions({}),
    }));
  }),

  update: adminProcedure
    .input(z.object({ userId: z.number().int().positive(), jobTitle: z.string().trim().min(2).max(120), isActive: z.boolean(), permissions: permissionsSchema }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id && !input.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot deactivate your own account." });
      const updated = await db.updateStaffAccess({ ...input, permissions: JSON.stringify(input.permissions), actorId: ctx.user.id });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Technical staff account not found." });
      const applied = await db.getStaffPermissionRecord(input.userId);
      if (!applied) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Saved staff access could not be verified. Refresh and try again." });
      return { success: true, appliedAccess: { jobTitle: applied.jobTitle, isActive: applied.isActive, permissions: normalizePermissions(JSON.parse(applied.permissions || "{}")) } };
    }),

  deleteAccount: adminProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    try { return await deleteStaffAccount({ userId: input.userId, actorId: ctx.user.id }); }
    catch (error) {
      if (error instanceof StaffDeletionError) throw new TRPCError({ code: error.code === "NOT_FOUND" ? "NOT_FOUND" : error.code === "ALREADY_DELETED" ? "CONFLICT" : "BAD_REQUEST", message: error.message });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The staff account could not be deleted. Please try again." });
    }
  }),

  createAccount: adminProcedure
    .input(z.object({
      fullName: accountNameSchema,
      email: normalizedEmailSchema,
      password: staffPasswordSchema,
      jobTitle: z.string().trim().min(2).max(120),
      isActive: z.boolean(),
      permissions: permissionsSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.email === SUPER_ADMIN_EMAIL) throw new TRPCError({ code: "CONFLICT", message: "The Super Admin email is reserved." });
      const { hash, salt } = await hashPassword(input.password);
      try {
        const userId = await db.createDirectStaffAccount({
          openId: `local:${randomBytes(16).toString("hex")}`,
          name: input.fullName,
          email: input.email,
          identifier: input.email,
          passwordHash: hash,
          passwordSalt: salt,
          jobTitle: input.jobTitle,
          isActive: input.isActive,
          permissions: JSON.stringify(input.permissions),
          actorId: ctx.user.id,
        });
        return { userId };
      } catch (error) {
        return accountManagementError(error);
      }
    }),

  editAccount: adminProcedure
    .input(z.object({ userId: z.number().int().positive(), fullName: accountNameSchema, email: normalizedEmailSchema }))
    .mutation(async ({ ctx, input }) => {
      if (input.email === SUPER_ADMIN_EMAIL) throw new TRPCError({ code: "CONFLICT", message: "The Super Admin email is reserved." });
      try {
        const result = await db.editStaffAccount({ ...input, actorId: ctx.user.id });
        if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Technical staff account not found." });
        return result;
      } catch (error) {
        return accountManagementError(error);
      }
    }),

  setAccountPassword: adminProcedure
    .input(z.object({ userId: z.number().int().positive(), password: staffPasswordSchema }))
    .mutation(async ({ ctx, input }) => {
      const { hash, salt } = await hashPassword(input.password);
      try {
        const result = await db.setStaffAccountPassword({ userId: input.userId, passwordHash: hash, passwordSalt: salt, actorId: ctx.user.id });
        if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Technical staff account not found." });
        return result;
      } catch (error) {
        return accountManagementError(error);
      }
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
