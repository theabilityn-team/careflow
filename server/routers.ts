import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { authenticateCredentials, createLoginSession, destroyLoginSession } from "./auth";
import { dashboardRouter } from "./routers/dashboard";
import { leadsRouter } from "./routers/leads";
import { scannerRouter } from "./routers/scanner";
import { staffRouter } from "./routers/staff";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    login: publicProcedure
      .input(z.object({ identifier: z.string().trim().min(1).max(320), password: z.string().min(8).max(200) }))
      .mutation(async ({ ctx, input }) => {
        const result = await authenticateCredentials(input.identifier, input.password);
        if (!result.ok) {
          if (result.reason === "locked") {
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many failed attempts. Try again in 15 minutes." });
          }
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username/email or password." });
        }
        await createLoginSession(ctx.res, ctx.req, result.user.id);
        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      await destroyLoginSession(ctx.req, ctx.res);
      return { success: true } as const;
    }),
  }),
  dashboard: dashboardRouter,
  leads: leadsRouter,
  scanner: scannerRouter,
  staff: staffRouter,
});

export type AppRouter = typeof appRouter;
