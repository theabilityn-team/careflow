import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authenticateOriginalRequest } from "../auth";
import {
  getCurrentImpersonation,
  listTargetsForActor,
  startImpersonation,
  stopImpersonation,
} from "../impersonation";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getUserAccess } from "../permissions";

const positiveUserId = z.number().int().positive();

async function safeOperation<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof TRPCError && error.code !== "INTERNAL_SERVER_ERROR") throw error;
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update impersonation. Please try again." });
  }
}


export const impersonationRouter = router({
  targets: protectedProcedure.query(async ({ ctx }) => {
    const access = await getUserAccess(ctx.user);
    if (ctx.user.role !== "admin" && (!access.isActive || !access.isLeader)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Leader or Super Admin access is required to view impersonation targets." });
    }
    return safeOperation(() => listTargetsForActor(ctx.user));
  }),

  status: publicProcedure.query(async ({ ctx }) => {
    const original = await safeOperation(() => authenticateOriginalRequest(ctx.req));
    return safeOperation(() => getCurrentImpersonation(ctx.req, original));
  }),

  start: protectedProcedure
    .input(z.object({ userId: positiveUserId }))
    .mutation(async ({ ctx, input }) => {
      const result = await safeOperation(() => startImpersonation({ req: ctx.req, actor: ctx.user, targetUserId: input.userId }));
      if (result.ok) return { success: true } as const;
      if (result.reason === "unauthorized") {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Your session is no longer valid." });
      }
      if (result.reason === "nested") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Impersonation cannot be chained." });
      }
      if (result.reason === "conflict") {
        throw new TRPCError({ code: "CONFLICT", message: "Impersonation could not be started. Refresh and try again." });
      }
      throw new TRPCError({ code: "FORBIDDEN", message: "You are not allowed to impersonate this staff member." });
    }),

  stop: publicProcedure.mutation(async ({ ctx }) => {
    const result = await safeOperation(() => stopImpersonation(ctx.req));
    if (!result.ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "Your session is no longer valid." });
    return { success: true } as const;
  }),
});
