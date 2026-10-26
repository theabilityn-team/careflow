import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../salesDb";
import { assertSalesAccess, assertSalesReadAccess, hasGlobalLeadAccess } from "../permissions";
import { getOrderDateRange } from "../../shared/orderDates";
import { protectedProcedure, router } from "../_core/trpc";

const MAX_EPOCH_MS = 8_640_000_000_000;
const positiveEpoch = z.number().int().positive().max(MAX_EPOCH_MS);
const nonnegativeCents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const quantity = z.number().int().positive().max(1_000_000);
const customerId = z.number().int().positive();
const orderId = z.number().int().positive();
const currency = z.enum(db.ORDER_CURRENCIES);
const status = z.enum(db.ORDER_STATUSES);
const pageInput = {
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
};
const orderListInput = z.object({
  search: z.string().trim().max(120).optional(),
  customerId: customerId.optional(),
  ownerUserId: z.number().int().positive().optional(),
  status: status.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  ...pageInput,
}).superRefine((value, context) => {
  try {
    getOrderDateRange(value.dateFrom, value.dateTo);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof RangeError ? error.message : "Purchase date range is invalid.",
      path: [],
    });
  }
});

const externalReference = z.string().trim().max(80).optional().nullable().transform(value => value || null);
const productName = z.string().trim().min(1).max(160);
const notes = z.string().max(20_000).optional().nullable();

const orderFields = z.object({
  customerId,
  externalReference,
  productName,
  quantity: quantity.default(1),
  unitPriceCents: nonnegativeCents,
  currency: currency.default("USD"),
  status: status.default("paid"),
  orderedAt: positiveEpoch,
  ownerUserId: z.number().int().positive().optional(),
  notes,
}).refine(value => Number.isSafeInteger(value.quantity * value.unitPriceCents), {
  message: "The order total is too large.",
  path: ["unitPriceCents"],
});

function mapSalesError(error: unknown): never {
  if (db.isDuplicateSalesReference(error)) {
    throw new TRPCError({ code: "CONFLICT", message: "An order with this external reference already exists." });
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "INVALID_OWNER") throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active credited staff member." });
  if (code === "CUSTOMER_NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
  if (error instanceof TRPCError) throw error;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The order could not be saved. Please try again." });
}

export const ordersRouter = router({
  list: protectedProcedure
    .input(orderListInput)
    .query(async ({ ctx, input }) => {
      const access = await assertSalesReadAccess(ctx.user);
      return db.listOrders(input, { userId: ctx.user.id, isGlobal: hasGlobalLeadAccess(access) });
    }),

  owners: protectedProcedure.query(async ({ ctx }) => {
    await assertSalesAccess(ctx.user);
    return db.listSalesOwners(ctx.user.id);
  }),

  create: protectedProcedure
    .input(orderFields)
    .mutation(async ({ ctx, input }) => {
      await assertSalesAccess(ctx.user);
      try {
        const result = await db.createSalesOrder({
          ...input,
          actorId: ctx.user.id,
          actorName: ctx.user.name,
          actorEmail: ctx.user.email,
          notes: input.notes ?? null,
          externalReference: input.externalReference ?? null,
        });
        if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
        return result;
      } catch (error) {
        return mapSalesError(error);
      }
    }),

  update: protectedProcedure
    .input(z.object({ id: orderId }).and(orderFields))
    .mutation(async ({ ctx, input }) => {
      await assertSalesAccess(ctx.user);
      try {
        const result = await db.updateSalesOrder({
          ...input,
          actorId: ctx.user.id,
          actorName: ctx.user.name,
          actorEmail: ctx.user.email,
          notes: input.notes ?? null,
          externalReference: input.externalReference ?? null,
        });
        if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
        return { orderId: result.orderId };
      } catch (error) {
        return mapSalesError(error);
      }
    }),

  get: protectedProcedure
    .input(z.object({ id: orderId }))
    .query(async ({ ctx, input }) => {
      const access = await assertSalesReadAccess(ctx.user);
      const result = await db.getSalesOrder(input.id, { userId: ctx.user.id, isGlobal: hasGlobalLeadAccess(access) });
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      return result;
    }),
});
