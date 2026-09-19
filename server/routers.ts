import { TRPCError } from "@trpc/server";
import { SUPER_ADMIN_EMAIL } from "@shared/const";
import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { authenticateStaffCredentials, authenticateSystemAdmin, createLoginSession, createSystemAdminLoginSession, destroyLoginSession, rotateSystemAdminPassword } from "./auth";
import { dashboardRouter } from "./routers/dashboard";
import { emailLibraryRouter } from "./routers/emailLibrary";
import { emailSettingsRouter } from "./routers/emailSettings";
import { groupsRouter } from "./routers/groups";
import { leadsRouter } from "./routers/leads";
import { mailRouter } from "./routers/mail";
import { scannerRouter } from "./routers/scanner";
import { staffRouter } from "./routers/staff";
import { superAdminPasswordSchema } from "./passwordSecurity";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    login: publicProcedure
      .input(z.discriminatedUnion("mode", [
        z.object({ mode: z.literal("staff"), identifier: z.string().trim().email().max(320), password: z.string().min(8).max(200) }),
        z.object({ mode: z.literal("super_admin"), identifier: z.literal(SUPER_ADMIN_EMAIL), password: z.string().min(8).max(200) }),
      ]))
      .mutation(async ({ ctx, input }) => {
        const result = input.mode === "super_admin"
          ? await authenticateSystemAdmin(input.identifier, input.password)
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
    changeSuperAdminPassword: adminProcedure
      .input(z.object({
        currentPassword: z.string().min(8).max(200),
        newPassword: superAdminPasswordSchema,
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.loginMethod !== "system") throw new TRPCError({ code: "FORBIDDEN", message: "Only the system Super Admin can change this password." });
        const result = await rotateSystemAdminPassword(input.currentPassword, input.newPassword);
        if (!result.ok) {
          if (result.reason === "same") throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a password different from the current password." });
          if (result.reason === "locked") throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many failed attempts. Try again in 15 minutes." });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "The current password is incorrect." });
        }
        await destroyLoginSession(ctx.req, ctx.res);
        return { success: true } as const;
      }),
  }),
  dashboard: dashboardRouter,
  emailLibrary: emailLibraryRouter,
  emailSettings: emailSettingsRouter,
  groups: groupsRouter,
  leads: leadsRouter,
  mail: mailRouter,
  scanner: scannerRouter,
  staff: staffRouter,
});

export type AppRouter = typeof appRouter;
