import { z } from "zod";
import * as db from "../db";
import { assertPermission, getUserAccess } from "../permissions";
import { protectedProcedure, router } from "../_core/trpc";

export const dashboardRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    const summary = await db.getDashboardSummary({ userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" });
    if (access.permissions.viewClinical) return summary;
    return {
      ...summary,
      recent: summary.recent.map(lead => ({
        ...lead,
        diagnosis: null,
        clinicalNotes: null,
        additionalInformation: null,
      })),
    };
  }),
  followUps: protectedProcedure.query(async ({ ctx }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    const followUps = await db.getUpcomingFollowUps({ userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" });
    return access.permissions.viewClinical
      ? followUps
      : followUps.map(lead => ({
          ...lead,
          diagnosis: null,
          clinicalNotes: null,
          additionalInformation: null,
        }));
  }),
  followUpCalendar: protectedProcedure
    .input(z.object({ from: z.number().int().nonnegative(), to: z.number().int().positive() }).refine(value => value.to >= value.from && value.to - value.from <= 370 * 24 * 60 * 60 * 1000, "Select a valid calendar range up to 370 days."))
    .query(async ({ ctx, input }) => {
      const access = await assertPermission(ctx.user, "viewLeads");
      return db.getFollowUpCalendar({ userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" }, input);
    }),
  followUpArchive: protectedProcedure
    .input(z.object({
      search: z.string().trim().max(120).optional(),
      method: z.enum(["phone", "email", "sms", "in_person", "other"]).optional(),
      completedFrom: z.number().int().nonnegative().optional(),
      completedTo: z.number().int().positive().optional(),
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().min(10).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const access = await assertPermission(ctx.user, "viewLeads");
      return db.getCompletedFollowUps({ userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" }, input);
    }),
  notifications: protectedProcedure.query(async ({ ctx }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    return db.listFollowUpNotifications({ userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" });
  }),
  reminderAutomationStatus: protectedProcedure.query(async ({ ctx }) => {
    const access = await getUserAccess(ctx.user);
    if (access.role !== "super_admin") return null;
    const job = await db.getScheduledJobByKey("follow-up-reminders");
    return {
      emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.REMINDER_FROM_EMAIL),
      scheduleConfigured: Boolean(job),
      timing: "Every 15 minutes; messages become due two hours before the appointment.",
    };
  }),
  markNotificationRead: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    await db.markFollowUpReminderRead(input.id, { userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" });
    return { success: true } as const;
  }),
  access: protectedProcedure.query(async ({ ctx }) => getUserAccess(ctx.user)),
});
