import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SUPER_ADMIN_EMAIL, SYSTEM_ADMIN_ACTOR_ID } from "../../shared/const";
import * as db from "../db";
import { composeEmailHtml, composeRichEmailHtml, DEFAULT_EMAIL_FOOTER_HTML, DEFAULT_EMAIL_HEADER_HTML, htmlToPlainText, renderTextTokens, sanitizeTemplateHtml } from "../mailContent";
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
const ownerInput = z.object({ userId: z.number().int().positive().optional() }).optional();
const managedSmtpInput = smtpInput.extend({ userId: z.number().int().positive().optional() });
const testEmailInput = z.object({
  userId: z.number().int().positive().optional(),
  recipientEmail: z.string().trim().email().max(320),
  messageTemplateId: z.number().int().positive(),
});
type SmtpInput = z.infer<typeof smtpInput>;
type StoredSmtpSettings = Awaited<ReturnType<typeof db.getStaffSmtpSettings>>;

type SmtpOwner = {
  ownerId: number;
  accountEmail: string | null;
  ownerName: string;
  isActive: boolean;
  isSuperAdmin: boolean;
};

async function resolveSmtpOwner(user: Parameters<typeof getUserAccess>[0], requestedUserId?: number): Promise<SmtpOwner> {
  const access = await getUserAccess(user);
  if (access.role === "technical_staff") {
    if (!access.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "Your staff account is inactive." });
    if (requestedUserId && requestedUserId !== user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Staff can access only their assigned SMTP status." });
    return { ownerId: user.id, accountEmail: user.email, ownerName: user.name || "Technical Staff", isActive: true, isSuperAdmin: false };
  }

  const ownerId = requestedUserId ?? SYSTEM_ADMIN_ACTOR_ID;
  if (ownerId === SYSTEM_ADMIN_ACTOR_ID) {
    return { ownerId, accountEmail: SUPER_ADMIN_EMAIL, ownerName: "Super Administrator", isActive: true, isSuperAdmin: true };
  }
  const target = await db.getUserById(ownerId);
  if (!target || target.role !== "user") throw new TRPCError({ code: "NOT_FOUND", message: "Technical staff account not found." });
  const permissions = await db.getStaffPermissionRecord(ownerId);
  return {
    ownerId,
    accountEmail: target.email,
    ownerName: target.name || "Technical Staff",
    isActive: permissions?.isActive ?? false,
    isSuperAdmin: false,
  };
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

export function publicStaffSmtpStatus(settings: StoredSmtpSettings, owner: SmtpOwner) {
  return {
    mode: "readonly" as const,
    userId: owner.ownerId,
    ownerName: owner.ownerName,
    accountEmail: owner.accountEmail,
    fromEmail: settings?.fromEmail || owner.accountEmail || "",
    isEnabled: settings?.isEnabled ?? false,
    configured: isSmtpConfigured(settings),
    verifiedAt: settings?.verifiedAt ?? null,
    lastTestedAt: settings?.lastTestedAt ?? null,
    lastTestError: settings?.lastTestError ? "The last SMTP test failed. Ask Super Admin to review the assigned settings." : null,
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
  managedAccounts: protectedProcedure.query(async ({ ctx }) => {
    const access = await getUserAccess(ctx.user);
    if (access.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only Super Admin can manage SMTP accounts." });
    const [systemSettings, staff] = await Promise.all([db.getStaffSmtpSettings(SYSTEM_ADMIN_ACTOR_ID), db.listStaff()]);
    return [{
      userId: SYSTEM_ADMIN_ACTOR_ID,
      name: "Super Administrator",
      accountEmail: SUPER_ADMIN_EMAIL,
      isActive: true,
      isSuperAdmin: true,
      smtpEnabled: systemSettings?.isEnabled ?? false,
      smtpFromEmail: systemSettings?.fromEmail || SUPER_ADMIN_EMAIL,
      smtpVerifiedAt: systemSettings?.verifiedAt ?? null,
      smtpLastTestedAt: systemSettings?.lastTestedAt ?? null,
      smtpLastTestError: systemSettings?.lastTestError ?? null,
    }, ...staff.map(member => ({
      userId: member.id,
      name: member.name || "Technical Staff",
      accountEmail: member.email,
      isActive: member.isActive ?? false,
      isSuperAdmin: false,
      smtpEnabled: member.smtpEnabled ?? false,
      smtpFromEmail: member.smtpFromEmail || member.email || "",
      smtpVerifiedAt: member.smtpVerifiedAt,
      smtpLastTestedAt: member.smtpLastTestedAt,
      smtpLastTestError: member.smtpLastTestError,
    }))];
  }),

  get: protectedProcedure.input(ownerInput).query(async ({ ctx, input }) => {
    const owner = await resolveSmtpOwner(ctx.user, input?.userId);
    const settings = await db.getStaffSmtpSettings(owner.ownerId);
    if (ctx.user.role !== "admin") return publicStaffSmtpStatus(settings, owner);
    return {
      mode: "manage" as const,
      userId: owner.ownerId,
      ownerName: owner.ownerName,
      accountEmail: owner.accountEmail,
      accountActive: owner.isActive,
      isSuperAdmin: owner.isSuperAdmin,
      ...publicStaffSmtpSettings(settings, owner.accountEmail),
    };
  }),

  save: protectedProcedure.input(managedSmtpInput).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only Super Admin can change SMTP settings." });
    const owner = await resolveSmtpOwner(ctx.user, input.userId);
    const existing = await db.getStaffSmtpSettings(owner.ownerId);
    const candidate = mergeStaffSmtpSettings(input, existing, owner.ownerName);
    if (input.isEnabled && !isSmtpConfigured(candidate)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Host, port, username, password, and sender email are required before enabling SMTP." });
    }
    const materialChanged = !existing || [
      "smtpHost", "smtpPort", "smtpSecurity", "smtpUsername", "fromEmail", "fromName", "replyToEmail", "isEnabled",
    ].some(field => String(existing[field as keyof typeof existing] ?? "") !== String(candidate[field as keyof typeof candidate] ?? "")) || Boolean(input.smtpPassword);
    const saved = await db.upsertStaffSmtpSettings({
      userId: owner.ownerId,
      ...candidate,
      verifiedAt: materialChanged ? null : existing?.verifiedAt ?? null,
      lastTestedAt: materialChanged ? null : existing?.lastTestedAt ?? null,
      lastTestError: materialChanged ? null : existing?.lastTestError ?? null,
    });
    return {
      mode: "manage" as const,
      userId: owner.ownerId,
      ownerName: owner.ownerName,
      accountEmail: owner.accountEmail,
      accountActive: owner.isActive,
      isSuperAdmin: owner.isSuperAdmin,
      ...publicStaffSmtpSettings(saved, owner.accountEmail),
    };
  }),

  testConnection: protectedProcedure.input(ownerInput).mutation(async ({ ctx, input }) => {
    const owner = await resolveSmtpOwner(ctx.user, input?.userId);
    const settings = await db.getStaffSmtpSettings(owner.ownerId);
    if (!settings) throw new TRPCError({ code: "BAD_REQUEST", message: "Super Admin must save SMTP settings before testing the connection." });
    const testedAt = Date.now();
    const result = await verifyStaffSmtp(settings);
    await db.updateStaffSmtpTestResult(owner.ownerId, {
      verifiedAt: result.ok ? testedAt : null,
      lastTestedAt: testedAt,
      lastTestError: result.error,
    });
    if (!result.ok) throw new TRPCError({ code: "BAD_REQUEST", message: owner.isSuperAdmin ? result.error : "SMTP connection failed. Ask Super Admin to review your assigned settings." });
    return { success: true, verifiedAt: testedAt } as const;
  }),

  testEmailTemplates: protectedProcedure.input(ownerInput).query(async ({ ctx, input }) => {
    await resolveSmtpOwner(ctx.user, input?.userId);
    const [products, templates] = await Promise.all([db.listEmailProducts(false), db.listEmailMessageTemplates(false)]);
    return products.map(product => ({
      id: product.id,
      name: product.name,
      templates: templates.filter(template => template.productId === product.id).map(template => ({
        id: template.id,
        name: template.name,
        subject: template.subject,
        contentMode: template.contentMode,
      })),
    })).filter(product => product.templates.length > 0);
  }),

  sendTestEmail: protectedProcedure.input(testEmailInput).mutation(async ({ ctx, input }) => {
    const owner = await resolveSmtpOwner(ctx.user, input.userId);
    const settings = await db.getStaffSmtpSettings(owner.ownerId);
    if (!settings) throw new TRPCError({ code: "BAD_REQUEST", message: "Super Admin must save SMTP settings before sending a test email." });
    const selectedTemplate = await db.getSelectableEmailMessageTemplate(input.messageTemplateId);
    if (!selectedTemplate) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active email template." });
    const testedAt = Date.now();
    const frame = await db.getEmailTemplate(SYSTEM_ADMIN_ACTOR_ID);
    const variables = {
      leadFirstName: "Test",
      leadFullName: "Test Recipient",
      senderName: settings.fromName || owner.ownerName || "CareFlow",
      senderEmail: settings.fromEmail,
    };
    const subject = renderTextTokens(selectedTemplate.subject, variables).replace(/[\r\n]+/g, " ").trim();
    const safeTemplateHtml = selectedTemplate.contentMode === "html" ? sanitizeTemplateHtml(selectedTemplate.bodyHtml ?? "") : null;
    if (selectedTemplate.contentMode === "html" && (!safeTemplateHtml || !htmlToPlainText(safeTemplateHtml))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The selected HTML template does not contain visible content." });
    }
    const html = selectedTemplate.contentMode === "html"
      ? composeRichEmailHtml(frame?.headerHtml ?? DEFAULT_EMAIL_HEADER_HTML, safeTemplateHtml!, frame?.footerHtml ?? DEFAULT_EMAIL_FOOTER_HTML, variables)
      : composeEmailHtml(frame?.headerHtml ?? DEFAULT_EMAIL_HEADER_HTML, selectedTemplate.bodyText, frame?.footerHtml ?? DEFAULT_EMAIL_FOOTER_HTML, variables);
    const result = await sendStaffSmtpEmail(settings, {
      to: input.recipientEmail,
      subject,
      text: htmlToPlainText(html),
      html,
    });
    await db.updateStaffSmtpTestResult(owner.ownerId, {
      verifiedAt: result.sent ? testedAt : null,
      lastTestedAt: testedAt,
      lastTestError: result.error,
    });
    if (!result.sent) throw new TRPCError({ code: "BAD_REQUEST", message: owner.isSuperAdmin ? result.error || "The test email could not be sent." : "The test email could not be sent. Ask Super Admin to review your assigned settings." });
    return { success: true, verifiedAt: testedAt, recipientEmail: input.recipientEmail, templateName: selectedTemplate.name } as const;
  }),
});
