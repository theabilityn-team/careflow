import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { authenticateStaffCredentials, authenticateSystemAdmin, createLoginSession, createSystemAdminLoginSession, destroyLoginSession } from "./auth";
import { dashboardRouter } from "./routers/dashboard";
import { leadsRouter } from "./routers/leads";
import { scannerRouter } from "./routers/scanner";
import { staffRouter } from "./routers/staff";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    login: publicProcedure
      .input(z.discriminatedUnion("mode", [
        z.object({ mode: z.literal("staff"), identifier: z.string().trim().email().max(320), password: z.string().min(8).max(200) }),
        z.object({ mode: z.literal("super_admin"), password: z.string().min(8).max(200) }),
      ]))
      .mutation(async ({ ctx, input }) => {
        const result = input.mode === "super_admin"
          ? await authenticateSystemAdmin(input.password)
          : await authenticateStaffCredentials(input.identifier, input.password);
        if (!result.ok) {
          if (result.reason === "locked") {
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many failed attempts. Try again in 15 minutes." });
          }
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username/email or password." });
        }
        if (input.mode === "super_admin") await createSystemAdminLoginSession(ctx.res, ctx.req);
        else await createLoginSession(ctx.res, ctx.req, result.user.id);
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
