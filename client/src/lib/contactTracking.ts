export const CONTACT_TRACKING_HELP = {
  lastContact: "Updated automatically to the current date and time whenever you save Log contact.",
  nextFollowUp: "An optional reminder for the next call, email, or action. Scheduled leads appear in the Follow-ups queue.",
  logContact: "Saving records the current time as the most recent contact. Adding a follow-up sets the lead to Follow-up required; leaving it blank sets the lead to Contacted and clears any existing reminder.",
} as const;

export type FollowUpTiming = "none" | "overdue" | "scheduled";

export function getFollowUpTiming(value?: number | null, now = Date.now()): FollowUpTiming {
  if (!value) return "none";
  return value < now ? "overdue" : "scheduled";
}

export function followUpTimingLabel(timing: FollowUpTiming) {
  if (timing === "overdue") return "Follow-up overdue";
  if (timing === "scheduled") return "Follow-up scheduled";
  return "No reminder scheduled";
}
