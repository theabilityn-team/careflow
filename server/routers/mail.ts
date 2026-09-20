import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SYSTEM_ADMIN_ACTOR_ID } from "../../shared/const";
import * as db from "../db";
import { composeEmailHtml, composeRichEmailHtml, DEFAULT_EMAIL_FOOTER_HTML, DEFAULT_EMAIL_HEADER_HTML, htmlToPlainText, renderTextTokens, sanitizeTemplateHtml } from "../mailContent";
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
    const access = await assertPermission(ctx.user, "manageContacts");
    if (access.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only Super Admin can manage the global email header and footer." });
    const template = await db.getEmailTemplate(SYSTEM_ADMIN_ACTOR_ID);
    return {
      headerHtml: template?.headerHtml ?? DEFAULT_EMAIL_HEADER_HTML,
      footerHtml: template?.footerHtml ?? DEFAULT_EMAIL_FOOTER_HTML,
      updatedAt: template?.updatedAt ?? null,
    };
  }),

  saveTemplate: protectedProcedure.input(templateInput).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "manageContacts");
    if (access.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only Super Admin can manage the global email header and footer." });
    const headerHtml = sanitizeTemplateHtml(input.headerHtml);
    const footerHtml = sanitizeTemplateHtml(input.footerHtml);
    await db.upsertEmailTemplate({ userId: SYSTEM_ADMIN_ACTOR_ID, headerHtml, footerHtml, updatedBy: ctx.user.id });
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

  leadHistory: protectedProcedure.input(z.object({ leadId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    if (!await db.canAccessLead(input.leadId, ctx.user.id, access.role === "super_admin")) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
    }
    const history = await db.listLeadOutboundEmails(input.leadId);
    return access.role === "super_admin" ? history : {
      ...history,
      messages: history.messages.map(message => ({
        ...message,
        error: message.error ? "Delivery failed. Ask Super Admin to review the sender SMTP account." : null,
      })),
    };
  }),

  leadMessage: protectedProcedure.input(z.object({ leadId: z.number().int().positive(), id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    if (!await db.canAccessLead(input.leadId, ctx.user.id, access.role === "super_admin")) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
    }
    const message = await db.getLeadOutboundEmail(input.id, input.leadId);
    if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Email not found." });
    return access.role === "super_admin" ? message : {
      ...message,
      error: message.error ? "Delivery failed. Ask Super Admin to review the sender SMTP account." : null,
    };
  }),

  send: protectedProcedure.input(z.object({
    leadId: z.number().int().positive(),
    messageTemplateId: z.number().int().positive().optional().nullable(),
    subject: z.string().trim().min(1).max(240),
    contentMode: z.enum(["plain", "html"]).default("plain"),
    bodyText: z.string().max(50_000).default(""),
    bodyHtml: z.string().max(250_000).optional().nullable(),
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
    if (input.contentMode === "html" && (!selectedTemplate || selectedTemplate.contentMode !== "html")) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active HTML email template before sending HTML content." });
    }
    if (selectedTemplate && selectedTemplate.contentMode !== input.contentMode) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The selected template format changed. Reapply the template before sending." });
    }
    const settings = await db.getStaffSmtpSettings(ownerId);
    if (!settings || !isSmtpConfigured(settings) || !settings.verifiedAt) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: access.role === "super_admin" ? "Configure, enable, and verify the Super Admin SMTP account before sending." : "Your SMTP account is not active and verified. Ask Super Admin to review it." });
    }
    const template = await db.getEmailTemplate(SYSTEM_ADMIN_ACTOR_ID);
    const variables = {
      leadFirstName: recipient.firstName,
      leadFullName: `${recipient.firstName} ${recipient.lastName}`.trim(),
      senderName: settings.fromName || ctx.user.name || "CareFlow",
      senderEmail: settings.fromEmail,
    };
    const subject = renderTextTokens(input.subject, variables).replace(/[\r\n]+/g, " ").trim();
    const headerHtml = template?.headerHtml ?? DEFAULT_EMAIL_HEADER_HTML;
    const footerHtml = template?.footerHtml ?? DEFAULT_EMAIL_FOOTER_HTML;
    const sanitizedBodyHtml = input.contentMode === "html" ? sanitizeTemplateHtml(input.bodyHtml ?? "") : null;
    if (input.contentMode === "html" && (!sanitizedBodyHtml || !htmlToPlainText(sanitizedBodyHtml))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The HTML email must contain visible content." });
    }
    const bodyText = input.contentMode === "html" ? htmlToPlainText(sanitizedBodyHtml!) : input.bodyText.trim();
    if (!bodyText) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter the email message." });
    const html = input.contentMode === "html"
      ? composeRichEmailHtml(headerHtml, sanitizedBodyHtml!, footerHtml, variables)
      : composeEmailHtml(headerHtml, bodyText, footerHtml, variables);
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
        notes: bodyText,
        contactedAt: sentAt,
        createdBy: ctx.user.id,
      });
    } catch {
      communicationLogged = false;
    }
    return { success: true, sentAt, communicationLogged } as const;
  }),
});
