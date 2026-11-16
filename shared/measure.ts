/** Fixed reporting baseline requested on 2026-11-16; not a rolling yesterday. */
export const MEASURE_REPORTING_START_DATE = "2026-11-15";
export const MEASURE_REPORTING_START_MS = Date.parse("2026-11-15T05:00:00Z");

export type MeasureBucket = "hour" | "day" | "week" | "month";
export type MeasurePeriod = "day" | "week" | "month" | "custom";
export type MeasureEventType = "login" | "logout" | "navigation" | "interaction" | "lead_open" | "status_change" | "contact" | "phone_contact" | "email_sent" | "order_entered" | "other_action";
/** No credentials, medical text, email subjects/recipients or arbitrary clicked text. */
export type MeasureEvent = {
  id: string; at: number; type: MeasureEventType; leadId?: number | null;
  sessionKey?: string | null; impersonatedById?: number | null;
  source: "tracking" | "audit" | "mail" | "session"; amountCents?: number; currency?: string;
  sessionStartedAt?: number; sessionExpiresAt?: number;
};
export type MeasureMetrics = {
  logins: number; navigation: number; interactions: number; leadOpens: number; uniqueLeadsOpened: number;
  statusChanges: number; contactsLogged: number; phoneContactsLogged: number; emailsSent: number;
  ordersEntered: number; ordersCredited: number; creditedValueByCurrency: Record<string, number>;
  activeMinutes: number; inactiveMinutes: number; leadWorkSamples: number; averageLeadMinutes: number | null;
  firstLoginAt: number | null; firstActivityAt: number | null; lastActivityAt: number | null;
};
export type MeasurePoint = { key: string; label: string; from: number; to: number; metrics: MeasureMetrics; hasActivity?: boolean; observed?: boolean };
export type MeasureInactivePeriod = { from: number; to: number; minutes: number; endedByActivity: boolean };
export type MeasureReport = {
  staff: { id: number; name: string; email: string | null; isActive: boolean };
  from: number; to: number; bucket: MeasureBucket; updatedThrough: number; generatedAt: number;
  inactivityMinutes: number; totals: MeasureMetrics; points: MeasurePoint[];
  chartPoints: MeasurePoint[]; chartThrough: number;
  impersonation: { events: number; leadOpens: number; statusChanges: number; emailsSent: number; ordersEntered: number };
  inactivePeriods: MeasureInactivePeriod[]; inactivePeriodsTotal: number;
  trackingSince: number | null; timingAvailable: boolean; historicalEvents: number;
  reportingSince: number; timingBasis: "activity_gaps" | "not_available";
  limitations: string[];
};
export type MeasureSettings = { inactivityMinutes: number; trackingSince: number | null };
export type MeasureStaff = { id: number; name: string; email: string | null; isActive: boolean; isLeader: boolean };
export type MeasureReportInput = { staffId: number; fromDate: string; toDate: string; bucket: MeasureBucket; period?: MeasurePeriod };
