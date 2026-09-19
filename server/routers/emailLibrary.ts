import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { assertPermission } from "../permissions";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";

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
  bodyText: z.string().trim().min(1).max(20_000),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(-10_000).max(10_000).default(0),
});

function cleanNullable(value?: string | null) {
  return value?.trim() || null;
}

function duplicateFriendly(error: unknown): never {
  if (typeof error === "object" && error && ("code" in error && String((error as { code?: unknown }).code).includes("DUP"))) {
    throw new TRPCError({ code: "CONFLICT", message: "A product or template with this name already exists in the same location." });
  }
  throw error;
}

function nestLibrary(products: Awaited<ReturnType<typeof db.listEmailProducts>>, templates: Awaited<ReturnType<typeof db.listEmailMessageTemplates>>) {
  return products.map(product => ({
    ...product,
    templates: templates.filter(template => template.productId === product.id),
  }));
}

export const emailLibraryRouter = router({
  library: protectedProcedure.query(async ({ ctx }) => {
    await assertPermission(ctx.user, "manageContacts");
    const [products, templates] = await Promise.all([db.listEmailProducts(false), db.listEmailMessageTemplates(false)]);
    return nestLibrary(products, templates);
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

  updateProduct: adminProcedure.input(z.object({ id: z.number().int().positive(), product: productFields })).mutation(async ({ ctx, input }) => {
    if (!await db.getEmailProduct(input.id)) throw new TRPCError({ code: "NOT_FOUND", message: "Email product not found." });
    try {
      return await db.updateEmailProduct(input.id, { ...input.product, description: cleanNullable(input.product.description), updatedBy: ctx.user.id });
    } catch (error) {
      duplicateFriendly(error);
    }
  }),

  createTemplate: adminProcedure.input(messageTemplateFields).mutation(async ({ ctx, input }) => {
    if (!await db.getEmailProduct(input.productId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an existing email product." });
    try {
      return await db.createEmailMessageTemplate({ ...input, description: cleanNullable(input.description), createdBy: ctx.user.id, updatedBy: ctx.user.id });
    } catch (error) {
      duplicateFriendly(error);
    }
  }),

  updateTemplate: adminProcedure.input(z.object({ id: z.number().int().positive(), template: messageTemplateFields })).mutation(async ({ ctx, input }) => {
    if (!await db.getEmailMessageTemplate(input.id)) throw new TRPCError({ code: "NOT_FOUND", message: "Email template not found." });
    if (!await db.getEmailProduct(input.template.productId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an existing email product." });
    try {
      return await db.updateEmailMessageTemplate(input.id, { ...input.template, description: cleanNullable(input.template.description), updatedBy: ctx.user.id });
    } catch (error) {
      duplicateFriendly(error);
    }
  }),
});
