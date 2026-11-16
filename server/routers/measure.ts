import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { MEASURE_REPORTING_START_DATE, MEASURE_REPORTING_START_MS, type MeasureReportInput } from "../../shared/measure";
import { measurePeriodRange } from "../../shared/measurePeriods";
import type { AuthenticatedPrincipal } from "../impersonation";
import { protectedProcedure, router } from "../_core/trpc";
import { getUserAccess } from "../permissions";
import * as measureDb from "../measureDb";
import { calculateMeasureReport, validateMeasureRange } from "../measureAnalytics";
import { clientActivityInput, recordClientActivity } from "../measureTracking";
const bucket = z.enum(["hour", "day", "week", "month"]);
const reportInput = z.object({
  staffId: z.number().int().positive(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bucket,
  period: z.enum(["day", "week", "month", "custom"]).optional(),
}) satisfies z.ZodType<MeasureReportInput>;
async function assertMeasureViewer(user: AuthenticatedPrincipal, options: { write?: boolean } = {}) {
  const access = await getUserAccess(user);
  const localStaff = user.role === "user" && user.loginMethod === "local";
  const allowed = user.role === "admin" || (localStaff && access.isActive && access.isLeader);
  if (!allowed || user.impersonation) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Leader or Super Admin access is required for Measure." });
  }
  if (options.write && user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only Super Admin can change Measure settings." });
  }
  return access;
}

function mapMeasureError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  if (error instanceof RangeError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  if ((error as { code?: unknown } | null)?.code === "MEASURE_TOO_LARGE") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This Measure range is too large. Narrow the date range and try again." });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Measure data could not be loaded. Please try again." });
}

export const measureRouter = router({
  staff: protectedProcedure.query(async ({ ctx }) => {
    try {
      await assertMeasureViewer(ctx.user);
      return await measureDb.listMeasureStaff();
    } catch (error) { return mapMeasureError(error); }
  }),

  settings: protectedProcedure.query(async ({ ctx }) => {
    try {
      await assertMeasureViewer(ctx.user);
      return await measureDb.getMeasureSettings();
    } catch (error) { return mapMeasureError(error); }
  }),

  saveSettings: protectedProcedure
    .input(z.object({ inactivityMinutes: z.number().int().min(1).max(240) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await assertMeasureViewer(ctx.user, { write: true });
        return await measureDb.saveMeasureSettings({ inactivityMinutes: input.inactivityMinutes, updatedBy: ctx.user.id });
      } catch (error) { return mapMeasureError(error); }
    }),

  record: protectedProcedure
    .input(clientActivityInput)
    .mutation(async ({ ctx, input }) => { try { return await recordClientActivity(ctx, input); } catch(error) { return mapMeasureError(error); } }),

  report: protectedProcedure
    .input(reportInput)
    .query(async ({ ctx, input }) => {
      try {
        await assertMeasureViewer(ctx.user);
        const resolved = input.period && input.period !== "custom" ? measurePeriodRange(input.period) : input;
        if (resolved.bucket === "hour" && resolved.fromDate !== resolved.toDate) throw new RangeError("Hourly Measure charts require a single Eastern calendar day.");
        const range = validateMeasureRange(resolved.fromDate, resolved.toDate);
        if (range.to < MEASURE_REPORTING_START_MS) throw new RangeError(`Measure reporting starts on ${MEASURE_REPORTING_START_DATE} Eastern.`);
        range.from = Math.max(range.from, MEASURE_REPORTING_START_MS);
        const staff = await measureDb.getMeasureStaff(input.staffId);
        if (!staff) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });
        const settings = await measureDb.getMeasureSettings();
        const data = await measureDb.getMeasureReportData({ staffId: input.staffId, from: range.from, to: range.to, updatedThrough: range.now });
        return calculateMeasureReport({ staff, from: range.from, to: range.to, chartTo: range.requestedTo, bucket: resolved.bucket, inactivityMinutes: settings.inactivityMinutes, updatedThrough: range.now, data });
      } catch (error) { return mapMeasureError(error); }
    }),
});
