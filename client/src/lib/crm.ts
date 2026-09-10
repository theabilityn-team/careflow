export const STATUS_OPTIONS = [
  ["new", "New"],
  ["pending_review", "Pending review"],
  ["verified", "Verified"],
  ["to_contact", "To be contacted"],
  ["contacted", "Contacted"],
  ["follow_up", "Follow-up required"],
  ["interested", "Interested"],
  ["highly_interested", "Highly interested"],
  ["qualified", "Qualified"],
  ["customer", "Customer"],
  ["buyer", "Buyer"],
  ["not_interested", "Not interested"],
  ["unable_to_reach", "Unable to reach"],
  ["archived", "Archived"],
] as const;

export const STATUS_DESCRIPTIONS: Record<(typeof STATUS_OPTIONS)[number][0], string> = {
  new: "Created but not yet reviewed or worked.",
  pending_review: "Information needs human verification before outreach.",
  verified: "The profile has been reviewed and is ready for work.",
  to_contact: "The team should make the first outreach attempt.",
  contacted: "At least one outreach or conversation has been completed.",
  follow_up: "A future conversation or action is required.",
  interested: "The lead has expressed general interest.",
  highly_interested: "The lead has strong intent and should be prioritized.",
  qualified: "The lead meets the team's purchasing or service criteria.",
  customer: "The person has entered the active customer relationship stage.",
  buyer: "A purchase has been completed.",
  not_interested: "The person explicitly declined or is not currently interested.",
  unable_to_reach: "Repeated outreach attempts did not reach the person.",
  archived: "The record is inactive and retained only for history.",
};

export const INTEREST_OPTIONS = [
  ["unknown", "Unknown"],
  ["cold", "Cold"],
  ["warm", "Warm"],
  ["hot", "Hot"],
] as const;

export const STATE_OPTIONS = [
  ["FL", "Florida"],
  ["AZ", "Arizona"],
  ["NV", "Nevada"],
  ["CA", "California"],
] as const;

export const DIAGNOSIS_CATEGORY_OPTIONS = [
  ["oncology", "Oncology"],
  ["hematology", "Hematology"],
] as const;

export const LANGUAGE_OPTIONS = [
  ["en", "English"],
  ["es", "Spanish"],
] as const;

export function stateLabel(value?: string | null) {
  return STATE_OPTIONS.find(([key]) => key === value)?.[1] ?? value ?? "State not set";
}

export function diagnosisCategoryLabel(value?: string | null) {
  return DIAGNOSIS_CATEGORY_OPTIONS.find(([key]) => key === value)?.[1] ?? value ?? "Diagnosis group not set";
}

export const PERMISSION_LABELS = {
  viewLeads: ["View leads", "Access lead profiles and search"],
  createLeads: ["Create leads", "Confirm new records after review"],
  editLeads: ["Edit lead details", "Correct and maintain profile information"],
  scanDocuments: ["Add leads from images", "Use single or bulk AI extraction on uploaded document images"],
  viewClinical: ["View clinical data", "Access diagnoses and medical notes"],
  manageContacts: ["Manage communications", "Log calls, messages, and follow-ups"],
  changeStatus: ["Change status", "Move leads through the lifecycle"],
  exportData: ["Export data", "Download customer information"],
} as const;

export type PermissionKey = keyof typeof PERMISSION_LABELS;

export function statusLabel(value: string) {
  return STATUS_OPTIONS.find(([key]) => key === value)?.[1] ?? value;
}

export function statusClass(value: string) {
  if (["buyer", "customer", "qualified"].includes(value)) return "bg-emerald-50 text-emerald-700 ring-emerald-600/15";
  if (["interested", "highly_interested", "follow_up"].includes(value)) return "bg-amber-50 text-amber-800 ring-amber-600/15";
  if (["not_interested", "unable_to_reach", "archived"].includes(value)) return "bg-slate-100 text-slate-600 ring-slate-500/15";
  return "bg-sky-50 text-sky-700 ring-sky-600/15";
}

export function initials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

export function formatDate(value?: number | Date | null, includeTime = false) {
  if (!value) return "Not set";
  const date = value instanceof Date ? value : new Date(value);
  return includeTime
    ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : date.toLocaleDateString([], { dateStyle: "medium" });
}
