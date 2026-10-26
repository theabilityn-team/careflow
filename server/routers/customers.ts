import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../salesDb";
import { canAccessLead } from "../db";
import { assertSalesAccess, assertSalesReadAccess, hasGlobalLeadAccess } from "../permissions";
import { protectedProcedure, router } from "../_core/trpc";

const positiveEpoch = z.number().int().positive().max(8_640_000_000_000);
const pageInput = {
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
};
const customerId = z.number().int().positive();
const stateCode = z.string().trim().length(2).toUpperCase();

async function requireSales(user: Parameters<typeof assertSalesAccess>[0]) {
  return assertSalesAccess(user);
}

async function requireSalesRead(user: Parameters<typeof assertSalesReadAccess>[0]) {
  return assertSalesReadAccess(user);
}

function mapSalesError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The customer could not be saved. Please try again." });
}

export const customersRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().trim().max(120).optional(),
      stateCode: stateCode.optional(),
      ...pageInput,
    }))
    .query(async ({ ctx, input }) => {
      const access = await requireSalesRead(ctx.user);
      return db.listCustomers(input, { userId: ctx.user.id, isGlobal: hasGlobalLeadAccess(access) });
    }),

  choices: protectedProcedure
    .input(z.object({ search: z.string().trim().max(120).optional() }))
    .query(async ({ ctx, input }) => {
      const access = await requireSalesRead(ctx.user);
      return db.listCustomerChoices(input.search, { userId: ctx.user.id, isGlobal: hasGlobalLeadAccess(access) });
    }),

  byLead: protectedProcedure
    .input(z.object({ leadId: customerId }))
    .query(async ({ ctx, input }) => {
      const access = await requireSalesRead(ctx.user);
      return db.getCustomerByLead(input.leadId, { userId: ctx.user.id, isGlobal: hasGlobalLeadAccess(access) });
    }),

  promote: protectedProcedure
    .input(z.object({
      leadId: customerId,
      customerSince: positiveEpoch.optional(),
      notes: z.string().max(20_000).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireSales(ctx.user);
      try {
        const result = await db.promoteLeadToCustomer({
          leadId: input.leadId,
          customerSince: input.customerSince ?? Date.now(),
          notes: input.notes ?? null,
          actorId: ctx.user.id,
          actorName: ctx.user.name,
          actorEmail: ctx.user.email,
        });
        if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
        return result;
      } catch (error) {
        return mapSalesError(error);
      }
    }),

  get: protectedProcedure
    .input(z.object({ id: customerId }))
    .query(async ({ ctx, input }) => {
      const access = await requireSalesRead(ctx.user);
      const result = await db.getCustomer(input.id, { userId: ctx.user.id, isGlobal: hasGlobalLeadAccess(access) });
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
      const canOpenLead = Boolean(access.permissions.viewLeads && await canAccessLead(result.customer.leadId, ctx.user.id, hasGlobalLeadAccess(access)));
      return { ...result, canOpenLead };
    }),
});
