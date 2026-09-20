export const CONTACT_TRACKING_HELP = {
  lastContact: "Updated automatically to the current date and time whenever you save Contact & follow-up.",
  nextFollowUp: "An optional reminder for the next call, email, or action. Scheduled leads appear in the Follow-ups queue.",
  contactFollowUp: "Record the contact result and optionally schedule a new follow-up reminder. Saving updates the most recent contact time but never changes the lead's business status.",
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
