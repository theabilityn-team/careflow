import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SYSTEM_ADMIN_ACTOR_ID } from "../../shared/const";
import * as db from "../db";
import { composeEmailHtml, composeRichEmailHtml, DEFAULT_EMAIL_FOOTER_HTML, DEFAULT_EMAIL_HEADER_HTML, htmlToPlainText, renderTextTokens, sanitizeTemplateHtml } from "../mailContent";
import { assertPermission } from "../permissions";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { isSmtpConfigured, sendStaffSmtpEmail } from "../smtp";

const productFields = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(-10_000).max(10_000).default(0),
});

const messageTemplateFields = z.object({
  productId: z.number().int().positive(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional().nullable(),
  subject: z.string().trim().min(1).max(240),
  contentMode: z.enum(["plain", "html"]).default("plain"),
  bodyText: z.string().max(50_000).default(""),
  bodyHtml: z.string().max(250_000).optional().nullable(),
  sourceFileName: z.string().trim().max(255).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(-10_000).max(10_000).default(0),
});

const sendTestEmailInput = z.object({
  recipientEmail: z.string().max(320)
    .refine(value => !/[\r\n]/.test(value), "Enter a valid recipient email address.")
    .trim()
    .email()
    .max(320),
  messageTemplateId: z.number().int().positive(),
}).strict();

function cleanNullable(value?: string | null) {
  return value?.trim() || null;
}

export function normalizeMessageTemplate(input: z.infer<typeof messageTemplateFields>) {
  if (input.contentMode === "html") {
    const bodyHtml = sanitizeTemplateHtml(input.bodyHtml ?? "");
    const bodyText = htmlToPlainText(bodyHtml);
    if (!bodyHtml || !bodyText) throw new TRPCError({ code: "BAD_REQUEST", message: "Upload or paste an HTML template with visible content." });
    return {
      ...input,
      description: cleanNullable(input.description),
      bodyText: bodyText.slice(0, 50_000),
      bodyHtml,
      sourceFileName: cleanNullable(input.sourceFileName?.replaceAll("\\", "/").split("/").pop()),
    };
  }

  const bodyText = input.bodyText.trim();
  if (!bodyText) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter the email message." });
  return { ...input, description: cleanNullable(input.description), bodyText, bodyHtml: null, sourceFileName: null };
}

function duplicateFriendly(error: unknown): never {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current; depth++) {
    if ("code" in current && String((current as { code?: unknown }).code).includes("DUP")) {
      throw new TRPCError({ code: "CONFLICT", message: "A product or template with this name already exists in the same location." });
    }
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  throw error;
}

function nestLibrary(products: Awaited<ReturnType<typeof db.listEmailProducts>>, templates: Awaited<ReturnType<typeof db.listEmailMessageTemplates>>) {
  return products.map(product => ({
    ...product,
    templates: templates.filter(template => template.productId === product.id),
  }));
}

async function assertTemplatePermissions(user: Parameters<typeof assertPermission>[0]) {
  const access = await assertPermission(user, "manageEmails");
  await assertPermission(user, "useEmailTemplates");
  return access;
}

function safePersonalFailure(error: unknown): never {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current; depth++) {
    if ("code" in current && String((current as { code?: unknown }).code).includes("DUP")) {
      throw new TRPCError({ code: "CONFLICT", message: "A product or template with this name already exists in the same location." });
    }
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to save the personal email template. Please try again." });
}

function safeTestEmailFailure(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to send the test email. Please try again." });
}

export const emailLibraryRouter = router({
  library: protectedProcedure.query(async ({ ctx }) => {
    const access = await assertTemplatePermissions(ctx.user);
    const viewer = { userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" };
    const [products, templates] = await Promise.all([db.listEmailProducts(false), db.listEmailMessageTemplates(false, viewer)]);
    return nestLibrary(products, templates);
  }),

  personalLibrary: protectedProcedure.query(async ({ ctx }) => {
    const access = await assertTemplatePermissions(ctx.user);
    const viewer = { userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" };
    const [products, templates] = await Promise.all([
      db.listEmailProducts(false),
      db.listEmailMessageTemplates(true, viewer, { activeProductsOnly: true }),
    ]);
    return nestLibrary(products, templates);
  }),

  sendTestEmail: protectedProcedure.input(sendTestEmailInput).mutation(async ({ ctx, input }) => {
    const access = await assertTemplatePermissions(ctx.user);
    const viewer = { userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" };

    try {
      const settings = await db.getStaffSmtpSettings(ctx.user.id);
      if (!settings || !isSmtpConfigured(settings) || !settings.verifiedAt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: access.role === "super_admin"
            ? "Configure, enable, and verify the Super Admin SMTP account before sending."
            : "Your SMTP account is not active and verified. Ask Super Admin to review it.",
        });
      }

      const selectedTemplate = await db.getSelectableEmailMessageTemplate(input.messageTemplateId, viewer);
      if (!selectedTemplate) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active email template." });

      const frame = await db.getEmailTemplate(SYSTEM_ADMIN_ACTOR_ID);
      const variables = {
        leadFirstName: "Test",
        leadFullName: "Test Recipient",
        senderName: settings.fromName || ctx.user.name || "CareFlow",
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
      if (!result.sent) throw new TRPCError({ code: "BAD_REQUEST", message: "The test email could not be sent. Ask Super Admin to review the sender SMTP account." });

      return {
        success: true,
        status: "sent" as const,
        recipientEmail: input.recipientEmail,
        templateName: selectedTemplate.name,
        fromEmail: settings.fromEmail,
        fromName: settings.fromName || ctx.user.name || "CareFlow",
      } as const;
    } catch (error) {
      safeTestEmailFailure(error);
    }
  }),

  adminList: adminProcedure.query(async () => {
    const [products, templates] = await Promise.all([db.listEmailProducts(true), db.listEmailMessageTemplates(true)]);
    return nestLibrary(products, templates);
  }),

  createProduct: adminProcedure.input(productFields).mutation(async ({ ctx, input }) => {
    try {
      return await db.createEmailProduct({ ...input, description: cleanNullable(input.description), createdBy: ctx.user.id, updatedBy: ctx.user.id });
    } catch (error) {
      duplicateFriendly(error);
    }
  }),

  copyProduct: adminProcedure.input(z.object({ id: z.number().int().positive(), product: productFields })).mutation(async ({ ctx, input }) => {
    const source = await db.getEmailProduct(input.id);
    if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Email product not found." });
    const sourceTemplates = await db.listEmailMessageTemplates(true);
    const copiedTemplates = sourceTemplates
      .filter(template => template.productId === source.id && (template.ownerUserId ?? SYSTEM_ADMIN_ACTOR_ID) === SYSTEM_ADMIN_ACTOR_ID)
      .map(template => {
        const normalized = normalizeMessageTemplate({
          productId: 0,
          name: template.name,
          description: template.description,
          subject: template.subject,
          contentMode: template.contentMode,
          bodyText: template.bodyText,
          bodyHtml: template.bodyHtml,
          sourceFileName: template.sourceFileName,
          isActive: template.isActive,
          sortOrder: template.sortOrder,
        });
        return {
          ...normalized,
          sourceFileName: cleanNullable(template.sourceFileName?.replaceAll("\\", "/").split("/").pop()),
        };
      })
      .map(({ productId: _productId, ...template }) => ({ ...template, createdBy: ctx.user.id, updatedBy: ctx.user.id }));
    try {
      return await db.createEmailProductWithTemplates({
        ...input.product,
        description: cleanNullable(input.product.description),
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }, copiedTemplates);
    } catch (error) {
      duplicateFriendly(error);
    }
  }),

  updateProduct: adminProcedure.input(z.object({ id: z.number().int().positive(), product: productFields })).mutation(async ({ ctx, input }) => {
    if (!await db.getEmailProduct(input.id)) throw new TRPCError({ code: "NOT_FOUND", message: "Email product not found." });
    try {
      return await db.updateEmailProduct(input.id, { ...input.product, description: cleanNullable(input.product.description), updatedBy: ctx.user.id });
    } catch (error) {
      duplicateFriendly(error);
    }
  }),

  deleteProduct: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const result = await db.deleteEmailProduct(input.id, ctx.user.id);
    if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Email product not found." });
    return result;
  }),

  createTemplate: adminProcedure.input(messageTemplateFields).mutation(async ({ ctx, input }) => {
    if (!await db.getEmailProduct(input.productId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an existing email product." });
    try {
      return await db.createEmailMessageTemplate({ ...normalizeMessageTemplate(input), createdBy: ctx.user.id, updatedBy: ctx.user.id });
    } catch (error) {
      duplicateFriendly(error);
    }
  }),

  updateTemplate: adminProcedure.input(z.object({ id: z.number().int().positive(), template: messageTemplateFields })).mutation(async ({ ctx, input }) => {
    if (!await db.getEmailMessageTemplate(input.id)) throw new TRPCError({ code: "NOT_FOUND", message: "Email template not found." });
    if (!await db.getEmailProduct(input.template.productId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an existing email product." });
    try {
      return await db.updateEmailMessageTemplate(input.id, { ...normalizeMessageTemplate(input.template), updatedBy: ctx.user.id });
    } catch (error) {
      duplicateFriendly(error);
    }
  }),

  deleteTemplate: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const result = await db.deleteEmailMessageTemplate(input.id, ctx.user.id);
    if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Email template not found." });
    return result;
  }),

  createPersonalTemplate: protectedProcedure.input(messageTemplateFields).mutation(async ({ ctx, input }) => {
    await assertTemplatePermissions(ctx.user);
    try {
      const result = await db.createPersonalEmailMessageTemplate(ctx.user.id, {
        ...normalizeMessageTemplate(input),
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      });
      if (!result) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active email product." });
      return result;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      safePersonalFailure(error);
    }
  }),

  updatePersonalTemplate: protectedProcedure.input(z.object({ id: z.number().int().positive(), template: messageTemplateFields })).mutation(async ({ ctx, input }) => {
    await assertTemplatePermissions(ctx.user);
    try {
      const viewer = { userId: ctx.user.id, isSuperAdmin: false };
      if (!await db.getEmailMessageTemplate(input.id, viewer)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Email template not found." });
      }
      const product = await db.getEmailProduct(input.template.productId);
      if (!product?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active email product." });
      const result = await db.updatePersonalEmailMessageTemplate(ctx.user.id, input.id, {
        ...normalizeMessageTemplate(input.template),
        updatedBy: ctx.user.id,
      });
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Email template not found." });
      return result;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      safePersonalFailure(error);
    }
  }),

  deletePersonalTemplate: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await assertTemplatePermissions(ctx.user);
    try {
      const result = await db.deletePersonalEmailMessageTemplate(ctx.user.id, input.id, ctx.user.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Email template not found." });
      return result;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      safePersonalFailure(error);
    }
  }),
});
