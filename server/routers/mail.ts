import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SYSTEM_ADMIN_ACTOR_ID } from "../../shared/const";
import { readStoredEmailAddresses } from "../outboundRecipients";
import * as db from "../db";
import { createEmailTrackingToken, instrumentEmailHtml } from "../emailTracking";
import { composeEmailFramePreview, composeEmailHtml, composeRichEmailHtml, DEFAULT_EMAIL_FOOTER_HTML, DEFAULT_EMAIL_HEADER_HTML, htmlToPlainText, renderTextTokens, sanitizeTemplateHtml } from "../mailContent";
import { assertPermission, hasGlobalLeadAccess } from "../permissions";
import { isSmtpConfigured, safeSmtpError, sendStaffSmtpEmail } from "../smtp";
import { normalizeMailRecipients } from "../../shared/emailRecipients";
import { protectedProcedure, router } from "../_core/trpc";

const templateInput = z.object({
  headerHtml: z.string().max(50_000),
  footerHtml: z.string().max(50_000),
});

const sendInput = z.object({
  leadId: z.number().int().positive().optional().nullable(),
  recipientEmail: z.string().max(320).optional().nullable(),
  recipientName: z.string().max(241).optional().nullable(),
  cc: z.array(z.string().max(320)).max(20).default([]),
  bcc: z.array(z.string().max(320)).max(20).default([]),
  messageTemplateId: z.number().int().positive().optional().nullable(),
  subject: z.string().trim().min(1).max(240),
  contentMode: z.enum(["plain", "html"]).default("plain"),
  bodyText: z.string().max(50_000).default(""),
  bodyHtml: z.string().max(250_000).optional().nullable(),
}).superRefine((input, ctx) => {
  const hasLead = input.leadId !== undefined && input.leadId !== null;
  const hasDirectRecipient = input.recipientEmail !== undefined && input.recipientEmail !== null;
  if (hasLead === hasDirectRecipient) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [hasLead ? "recipientEmail" : "leadId"], message: "Provide exactly one lead or direct recipient email." });
  }
});

function senderId(user: { id: number; role: "user" | "admin" }) {
  return user.role === "admin" ? SYSTEM_ADMIN_ACTOR_ID : user.id;
}

function recipientArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((address): address is string => typeof address === "string" && address.length <= 320 && !/[\r\n]/.test(address));
  return readStoredEmailAddresses(value);
}

function serializeMessage<T extends { bccEmails?: unknown; ccEmails?: unknown; senderUserId?: number }>(message: T, viewer: { id: number; role: "user" | "admin" }, access: { role: string }): Omit<T, "ccEmails" | "bccEmails"> & { ccEmails: string[]; bccEmails: string[] } {
  const canSeeBcc = access.role === "super_admin" || (typeof message.senderUserId === "number" && message.senderUserId === senderId(viewer));
  return {
    ...message,
    ccEmails: recipientArray(message.ccEmails),
    bccEmails: canSeeBcc ? recipientArray(message.bccEmails) : [],
  };
}

function safeDeliveryError(error: string | null | undefined, password: string, addresses: string[]) {
  return error ? safeSmtpError(new Error(error), password, addresses) : null;
}

export const mailRouter = router({
  recipients: protectedProcedure.input(z.object({ search: z.string().trim().max(120).optional() })).query(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "manageEmails");
    return db.listEmailRecipients({ userId: ctx.user.id, isSuperAdmin: hasGlobalLeadAccess(access) }, input.search);
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

  previewTemplate: protectedProcedure.input(templateInput).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "manageContacts");
    if (access.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only Super Admin can manage the global email header and footer." });
    return {
      html: composeEmailFramePreview(input.headerHtml, input.footerHtml),
      headerHtml: sanitizeTemplateHtml(input.headerHtml),
      footerHtml: sanitizeTemplateHtml(input.footerHtml),
    };
  }),

  history: protectedProcedure.query(async ({ ctx }) => {
    const access = await assertPermission(ctx.user, "manageEmails");
    const messages = await db.listOutboundEmails({ userId: ctx.user.id, isSuperAdmin: hasGlobalLeadAccess(access) });
    return messages.map(message => {
      const safeMessage = serializeMessage(message, ctx.user, access);
      return access.role === "super_admin" ? safeMessage : { ...safeMessage, error: message.error ? "Delivery failed. Ask Super Admin to review your assigned SMTP account." : null };
    });
  }),

  message: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "manageEmails");
    const message = await db.getOutboundEmail(input.id, { userId: ctx.user.id, isSuperAdmin: hasGlobalLeadAccess(access) });
    if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Email not found." });
    const { trackingToken: _trackingToken, ...withoutTracking } = message;
    const publicMessage = { ...serializeMessage(withoutTracking, ctx.user, access), trackingEnabled: Boolean(_trackingToken) };
    return access.role === "super_admin" ? publicMessage : { ...publicMessage, error: message.error ? "Delivery failed. Ask Super Admin to review your assigned SMTP account." : null };
  }),

  leadHistory: protectedProcedure.input(z.object({ leadId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    await assertPermission(ctx.user, "manageEmails");
    if (!await db.canAccessLead(input.leadId, ctx.user.id, hasGlobalLeadAccess(access))) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
    }
    const history = await db.listLeadOutboundEmails(input.leadId);
    return access.role === "super_admin" ? {
      ...history,
      messages: history.messages.map(message => serializeMessage(message, ctx.user, access)),
    } : {
      ...history,
      messages: history.messages.map(message => ({
        ...serializeMessage(message, ctx.user, access),
        error: message.error ? "Delivery failed. Ask Super Admin to review the sender SMTP account." : null,
      })),
    };
  }),

  leadMessage: protectedProcedure.input(z.object({ leadId: z.number().int().positive(), id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    await assertPermission(ctx.user, "manageEmails");
    if (!await db.canAccessLead(input.leadId, ctx.user.id, hasGlobalLeadAccess(access))) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
    }
    const message = await db.getLeadOutboundEmail(input.id, input.leadId);
    if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Email not found." });
    const { trackingToken: _trackingToken, ...withoutTracking } = message;
    const publicMessage = { ...serializeMessage(withoutTracking, ctx.user, access), trackingEnabled: Boolean(_trackingToken) };
    return access.role === "super_admin" ? publicMessage : {
      ...publicMessage,
      error: message.error ? "Delivery failed. Ask Super Admin to review the sender SMTP account." : null,
    };
  }),

  send: protectedProcedure.input(sendInput).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "manageEmails");
    const ownerId = senderId(ctx.user);
    const hasLead = input.leadId !== undefined && input.leadId !== null;
    const viewer = { userId: ctx.user.id, isSuperAdmin: hasGlobalLeadAccess(access) };
    const recipient = hasLead ? await db.getEmailRecipient(input.leadId!, viewer) : undefined;
    if (hasLead && !recipient) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
    if (hasLead && !recipient!.email?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "This lead does not have an email address." });

    let normalizedRecipients: ReturnType<typeof normalizeMailRecipients>;
    try {
      normalizedRecipients = normalizeMailRecipients({
        to: hasLead ? recipient!.email! : input.recipientEmail!,
        cc: input.cc,
        bcc: input.bcc,
      });
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Enter valid email recipients." });
    }

    if (input.messageTemplateId !== undefined && input.messageTemplateId !== null || input.contentMode === "html") {
      await assertPermission(ctx.user, "useEmailTemplates");
    }
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
    const directName = input.recipientName?.trim() || normalizedRecipients.to;
    const directFirstName = input.recipientName?.trim().split(/\s+/)[0] || "there";
    const variables = {
      leadFirstName: hasLead ? recipient!.firstName : directFirstName,
      leadFullName: hasLead ? `${recipient!.firstName} ${recipient!.lastName}`.trim() : directName,
      senderName: settings.fromName || ctx.user.name || "CareFlow",
      senderEmail: settings.fromEmail,
    };
    const subject = renderTextTokens(input.subject, variables).replace(/[\r\n]+/g, " ").trim();
    if (!subject || subject.length > 240) throw new TRPCError({ code: "BAD_REQUEST", message: "The personalized subject must contain 1–240 characters. Shorten it before sending." });
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
    const trackingToken = createEmailTrackingToken();
    const trackedHtml = instrumentEmailHtml(html, trackingToken);
    const addressSecrets = [normalizedRecipients.to, ...normalizedRecipients.cc, ...normalizedRecipients.bcc];
    const result = await sendStaffSmtpEmail(settings, {
      to: normalizedRecipients.to,
      cc: normalizedRecipients.cc,
      bcc: normalizedRecipients.bcc,
      subject,
      text: htmlToPlainText(html),
      html: trackedHtml,
    });
    const safeError = safeDeliveryError(result.error, settings.smtpPassword, addressSecrets);
    const sentAt = Date.now();
    try {
      await db.addOutboundEmail({
        senderUserId: ownerId,
        leadId: hasLead ? recipient!.id : null,
        recipientEmail: normalizedRecipients.to,
        ccEmails: normalizedRecipients.cc.length ? JSON.stringify(normalizedRecipients.cc) : null,
        bccEmails: normalizedRecipients.bcc.length ? JSON.stringify(normalizedRecipients.bcc) : null,
        recipientName: variables.leadFullName.slice(0, 241),
        fromEmail: settings.fromEmail,
        productId: selectedTemplate?.productId ?? null,
        messageTemplateId: selectedTemplate?.id ?? null,
        productName: selectedTemplate?.productName ?? null,
        templateName: selectedTemplate?.name ?? null,
        subject,
        bodyHtml: html,
        status: result.sent ? "sent" : "failed",
        providerMessageId: result.sent ? result.messageId ?? null : null,
        error: safeError,
        trackingToken: result.sent ? trackingToken : null,
        sentAt,
      });
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Email delivery completed, but the delivery history could not be saved." });
    }
    if (!result.sent) {
      throw new TRPCError({ code: "BAD_REQUEST", message: access.role === "super_admin" ? safeError || "Email could not be sent." : "Email could not be sent. Ask Super Admin to review your assigned SMTP account." });
    }
    let communicationLogged = false;
    if (hasLead) {
      communicationLogged = true;
      try {
        await db.addCommunicationWithAudit({
          leadId: recipient!.id,
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
    }
    return { success: true, sentAt, communicationLogged, linkedToLead: hasLead } as const;
  }),
});
