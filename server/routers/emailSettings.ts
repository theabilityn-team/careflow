import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { getUserAccess } from "../permissions";
import { protectedProcedure, router } from "../_core/trpc";
import { isSmtpConfigured, sendStaffSmtpEmail, verifyStaffSmtp } from "../smtp";

const smtpInput = z.object({
  smtpHost: z.string().trim().max(255),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecurity: z.enum(["tls", "starttls", "none"]),
  smtpUsername: z.string().trim().max(320),
  smtpPassword: z.string().max(1000).optional(),
  fromEmail: z.union([z.string().trim().email().max(320), z.literal("")]),
  fromName: z.string().trim().max(160),
  replyToEmail: z.union([z.string().trim().email().max(320), z.literal("")]).optional(),
  isEnabled: z.boolean(),
});
type SmtpInput = z.infer<typeof smtpInput>;
type StoredSmtpSettings = Awaited<ReturnType<typeof db.getStaffSmtpSettings>>;

async function assertTechnicalStaff(user: Parameters<typeof getUserAccess>[0]) {
  const access = await getUserAccess(user);
  if (access.role !== "technical_staff") throw new TRPCError({ code: "FORBIDDEN", message: "SMTP settings belong to technical staff accounts." });
  if (!access.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "Your staff account is inactive." });
  return access;
}

export function publicStaffSmtpSettings(settings: StoredSmtpSettings, accountEmail: string | null) {
  if (!settings) return {
    smtpHost: "",
    smtpPort: 587,
    smtpSecurity: "starttls" as const,
    smtpUsername: accountEmail ?? "",
    fromEmail: accountEmail ?? "",
    fromName: "CareFlow",
    replyToEmail: "",
    isEnabled: false,
    hasPassword: false,
    configured: false,
    verifiedAt: null,
    lastTestedAt: null,
    lastTestError: null,
  };
  return {
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecurity: settings.smtpSecurity,
    smtpUsername: settings.smtpUsername,
    fromEmail: settings.fromEmail,
    fromName: settings.fromName,
    replyToEmail: settings.replyToEmail ?? "",
    isEnabled: settings.isEnabled,
    hasPassword: Boolean(settings.smtpPassword),
    configured: isSmtpConfigured(settings),
    verifiedAt: settings.verifiedAt,
    lastTestedAt: settings.lastTestedAt,
    lastTestError: settings.lastTestError,
  };
}

export function mergeStaffSmtpSettings(input: SmtpInput, existing: StoredSmtpSettings, fallbackName: string | null) {
  return {
    ...input,
    smtpPassword: input.smtpPassword || existing?.smtpPassword || "",
    replyToEmail: input.replyToEmail || null,
    fromName: input.fromName || fallbackName || "CareFlow",
  };
}

export const emailSettingsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    await assertTechnicalStaff(ctx.user);
    const settings = await db.getStaffSmtpSettings(ctx.user.id);
    return publicStaffSmtpSettings(settings, ctx.user.email);
  }),

  save: protectedProcedure.input(smtpInput).mutation(async ({ ctx, input }) => {
    await assertTechnicalStaff(ctx.user);
    const existing = await db.getStaffSmtpSettings(ctx.user.id);
    const candidate = mergeStaffSmtpSettings(input, existing, ctx.user.name);
    if (input.isEnabled && !isSmtpConfigured(candidate)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Host, port, username, password, and sender email are required before enabling SMTP." });
    }
    const materialChanged = !existing || [
      "smtpHost", "smtpPort", "smtpSecurity", "smtpUsername", "fromEmail", "fromName", "replyToEmail", "isEnabled",
    ].some(field => String(existing[field as keyof typeof existing] ?? "") !== String(candidate[field as keyof typeof candidate] ?? "")) || Boolean(input.smtpPassword);
    const saved = await db.upsertStaffSmtpSettings({
      userId: ctx.user.id,
      ...candidate,
      verifiedAt: materialChanged ? null : existing?.verifiedAt ?? null,
      lastTestedAt: materialChanged ? null : existing?.lastTestedAt ?? null,
      lastTestError: materialChanged ? null : existing?.lastTestError ?? null,
    });
    return publicStaffSmtpSettings(saved, ctx.user.email);
  }),

  testConnection: protectedProcedure.mutation(async ({ ctx }) => {
    await assertTechnicalStaff(ctx.user);
    const settings = await db.getStaffSmtpSettings(ctx.user.id);
    if (!settings) throw new TRPCError({ code: "BAD_REQUEST", message: "Save SMTP settings before testing the connection." });
    const testedAt = Date.now();
    const result = await verifyStaffSmtp(settings);
    await db.updateStaffSmtpTestResult(ctx.user.id, {
      verifiedAt: result.ok ? testedAt : null,
      lastTestedAt: testedAt,
      lastTestError: result.error,
    });
    if (!result.ok) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
    return { success: true, verifiedAt: testedAt } as const;
  }),

  sendTestEmail: protectedProcedure.mutation(async ({ ctx }) => {
    await assertTechnicalStaff(ctx.user);
    const settings = await db.getStaffSmtpSettings(ctx.user.id);
    if (!settings) throw new TRPCError({ code: "BAD_REQUEST", message: "Save SMTP settings before sending a test email." });
    const testedAt = Date.now();
    const recipient = ctx.user.email || settings.fromEmail;
    if (!recipient) throw new TRPCError({ code: "BAD_REQUEST", message: "This staff account does not have an email address." });
    const result = await sendStaffSmtpEmail(settings, {
      to: recipient,
      subject: "CareFlow SMTP test",
      text: `Hello ${ctx.user.name || "CareFlow staff member"},\n\nYour personal SMTP account is connected and can send CareFlow email reminders.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:620px"><h2 style="color:#0f766e">CareFlow SMTP test</h2><p>Your personal SMTP account is connected and can send CareFlow email reminders.</p></div>`,
    });
    await db.updateStaffSmtpTestResult(ctx.user.id, {
      verifiedAt: result.sent ? testedAt : null,
      lastTestedAt: testedAt,
      lastTestError: result.error,
    });
    if (!result.sent) throw new TRPCError({ code: "BAD_REQUEST", message: result.error || "The test email could not be sent." });
    return { success: true, verifiedAt: testedAt } as const;
  }),
});
