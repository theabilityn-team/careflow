import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SYSTEM_ADMIN_ACTOR_ID } from "../../shared/const";
import * as db from "../db";
import { composeEmailHtml, DEFAULT_EMAIL_FOOTER_HTML, DEFAULT_EMAIL_HEADER_HTML, htmlToPlainText, renderTextTokens, sanitizeTemplateHtml } from "../mailContent";
import { assertPermission } from "../permissions";
import { isSmtpConfigured, sendStaffSmtpEmail } from "../smtp";
import { protectedProcedure, router } from "../_core/trpc";

const templateInput = z.object({
  headerHtml: z.string().max(50_000),
  footerHtml: z.string().max(50_000),
});

function senderId(user: { id: number; role: "user" | "admin" }) {
  return user.role === "admin" ? SYSTEM_ADMIN_ACTOR_ID : user.id;
}

export const mailRouter = router({
  recipients: protectedProcedure.input(z.object({ search: z.string().trim().max(120).optional() })).query(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "manageContacts");
    return db.listEmailRecipients({ userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" }, input.search);
  }),

  template: protectedProcedure.query(async ({ ctx }) => {
    await assertPermission(ctx.user, "manageContacts");
    const template = await db.getEmailTemplate(senderId(ctx.user));
    return {
      headerHtml: template?.headerHtml ?? DEFAULT_EMAIL_HEADER_HTML,
      footerHtml: template?.footerHtml ?? DEFAULT_EMAIL_FOOTER_HTML,
      updatedAt: template?.updatedAt ?? null,
    };
  }),

  saveTemplate: protectedProcedure.input(templateInput).mutation(async ({ ctx, input }) => {
    await assertPermission(ctx.user, "manageContacts");
    const headerHtml = sanitizeTemplateHtml(input.headerHtml);
    const footerHtml = sanitizeTemplateHtml(input.footerHtml);
    await db.upsertEmailTemplate({ userId: senderId(ctx.user), headerHtml, footerHtml, updatedBy: ctx.user.id });
    return { headerHtml, footerHtml };
  }),

  history: protectedProcedure.query(async ({ ctx }) => {
    const access = await assertPermission(ctx.user, "manageContacts");
    const messages = await db.listOutboundEmails({ userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" });
    return access.role === "super_admin" ? messages : messages.map(message => ({ ...message, error: message.error ? "Delivery failed. Ask Super Admin to review your assigned SMTP account." : null }));
  }),

  message: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "manageContacts");
    const message = await db.getOutboundEmail(input.id, { userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" });
    if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Email not found." });
    return access.role === "super_admin" ? message : { ...message, error: message.error ? "Delivery failed. Ask Super Admin to review your assigned SMTP account." : null };
  }),

  send: protectedProcedure.input(z.object({
    leadId: z.number().int().positive(),
    messageTemplateId: z.number().int().positive().optional().nullable(),
    subject: z.string().trim().min(1).max(240),
    bodyText: z.string().trim().min(1).max(20_000),
  })).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "manageContacts");
    const viewer = { userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" };
    const recipient = await db.getEmailRecipient(input.leadId, viewer);
    if (!recipient) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
    if (!recipient.email?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "This lead does not have an email address." });

    const ownerId = senderId(ctx.user);
    const selectedTemplate = input.messageTemplateId ? await db.getSelectableEmailMessageTemplate(input.messageTemplateId) : undefined;
    if (input.messageTemplateId && !selectedTemplate) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The selected email template is inactive or no longer available." });
    }
    const settings = await db.getStaffSmtpSettings(ownerId);
    if (!settings || !isSmtpConfigured(settings) || !settings.verifiedAt) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: access.role === "super_admin" ? "Configure, enable, and verify the Super Admin SMTP account before sending." : "Your SMTP account is not active and verified. Ask Super Admin to review it." });
    }
    const template = await db.getEmailTemplate(ownerId);
    const variables = {
      leadFirstName: recipient.firstName,
      leadFullName: `${recipient.firstName} ${recipient.lastName}`.trim(),
      senderName: settings.fromName || ctx.user.name || "CareFlow",
      senderEmail: settings.fromEmail,
    };
    const subject = renderTextTokens(input.subject, variables).replace(/[\r\n]+/g, " ").trim();
    const html = composeEmailHtml(template?.headerHtml ?? DEFAULT_EMAIL_HEADER_HTML, input.bodyText, template?.footerHtml ?? DEFAULT_EMAIL_FOOTER_HTML, variables);
    const result = await sendStaffSmtpEmail(settings, { to: recipient.email.trim(), subject, text: htmlToPlainText(html), html });
    const sentAt = Date.now();
    await db.addOutboundEmail({
      senderUserId: ownerId,
      leadId: recipient.id,
      recipientEmail: recipient.email.trim(),
      recipientName: variables.leadFullName,
      fromEmail: settings.fromEmail,
      productId: selectedTemplate?.productId ?? null,
      messageTemplateId: selectedTemplate?.id ?? null,
      productName: selectedTemplate?.productName ?? null,
      templateName: selectedTemplate?.name ?? null,
      subject,
      bodyHtml: html,
      status: result.sent ? "sent" : "failed",
      providerMessageId: result.sent ? result.messageId ?? null : null,
      error: result.error,
      sentAt,
    });
    if (!result.sent) {
      throw new TRPCError({ code: "BAD_REQUEST", message: access.role === "super_admin" ? result.error || "Email could not be sent." : "Email could not be sent. Ask Super Admin to review your assigned SMTP account." });
    }
    let communicationLogged = true;
    try {
      await db.addCommunicationWithAudit({
        leadId: recipient.id,
        method: "email",
        direction: "outbound",
        outcome: `Email sent: ${subject}`.slice(0, 160),
        notes: input.bodyText,
        contactedAt: sentAt,
        createdBy: ctx.user.id,
      });
    } catch {
      communicationLogged = false;
    }
    return { success: true, sentAt, communicationLogged } as const;
  }),
});
