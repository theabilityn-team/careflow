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

export const INTEREST_OPTIONS = [
  ["unknown", "Unknown"],
  ["cold", "Cold"],
  ["warm", "Warm"],
  ["hot", "Hot"],
] as const;

export const PERMISSION_LABELS = {
  viewLeads: ["View leads", "Access lead profiles and search"],
  createLeads: ["Create leads", "Confirm new records after review"],
  editLeads: ["Edit lead details", "Correct and maintain profile information"],
  scanDocuments: ["Scan documents", "Use AI extraction on uploaded images"],
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
