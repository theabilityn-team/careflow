import * as db from "../db";
import { assertPermission, getUserAccess } from "../permissions";
import { protectedProcedure, router } from "../_core/trpc";

export const dashboardRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    const summary = await db.getDashboardSummary();
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
    const followUps = await db.getUpcomingFollowUps();
    return access.permissions.viewClinical
      ? followUps
      : followUps.map(lead => ({
          ...lead,
          diagnosis: null,
          clinicalNotes: null,
          additionalInformation: null,
        }));
  }),
  access: protectedProcedure.query(async ({ ctx }) => getUserAccess(ctx.user)),
});
