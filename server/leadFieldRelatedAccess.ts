import { TRPCError } from "@trpc/server";
import { canEditLeadField, canViewLeadField, fieldKeyForLeadProperty, hasHiddenLeadFields, type LeadFieldAccess } from "../shared/leadFieldPermissions";
import { redactLeadFields } from "./leadFieldAccess";
export type RelatedLeadAccess = LeadFieldAccess;
export function asLeadFieldAccess(access: unknown): RelatedLeadAccess {
  const candidate = access && typeof access === "object" ? access as RelatedLeadAccess : {};
  const permissions = candidate.permissions && typeof candidate.permissions === "object" ? candidate.permissions : {};
  return { ...candidate, permissions, leadFields: Object.hasOwn(candidate, "leadFields") ? candidate.leadFields : (permissions as Record<string, unknown>).leadFields };
}
const LEAD_ALIASES: Record<string, string> = {
  leadFirstName: "firstName", customerFirstName: "firstName", leadLastName: "lastName", customerLastName: "lastName",
  leadEmail: "email", customerEmail: "email", recipientEmail: "email", leadPhone: "phone", customerPhone: "phone",
  leadStatus: "status", leadStateCode: "stateCode", assignedStaff: "assignedTo", assignedStaffName: "assignedTo",
  scheduledFor: "nextFollowUpAt", originalScheduledFor: "nextFollowUpAt", rescheduledFor: "nextFollowUpAt",
};
const FULL_NAME_KEYS = new Set(["fullName", "customerName", "leadName", "leadFullName", "recipientName"]);
const UNSTRUCTURED_KEYS = new Set(["notes", "note", "outcome", "message", "messageText", "notificationText", "detail", "body", "bodyText", "bodyHtml", "subject", "cc", "bcc", "ccEmails", "bccEmails", "trackedLinks", "trackingLinks", "error", "lastError", "deliveryError"]);
const STAFF_KEYS = new Set(["actorName", "actorEmail", "senderName", "senderEmail", "completedByName", "ownerName", "createdByName", "updatedByName", "impersonatedByName", "fromEmail", "fromName"]);
const SNAPSHOT_KEYS = new Set(["snapshotBefore", "snapshotAfter"]);
const LEAD_SNAPSHOT_CONTAINERS = new Set(["lead", "leadSnapshot", "customer", "customerSnapshot", "linkedLead"]);
const SNAPSHOT_NAME_KEYS = new Set(["firstName", "lastName", "fullName", "customerName", "leadName", "leadFullName", "recipientName"]);
const SNAPSHOT_LEAD_KEYS = new Set(["firstName", "lastName", "email", "phone", "address", "city", "stateProvince", "postalCode", "country", "dateOfBirth", "preferredLanguage", "stateCode", "diagnosisCategory", "diagnosis", "clinicalNotes", "sourceDocumentType", "interestLevel", "assignedTo", "lastContactAt", "nextFollowUpAt", "additionalInformation"]);

function snapshotReplacement(key: string, value: unknown, access: LeadFieldAccess): unknown {
  const fieldKey = LEAD_ALIASES[key] ?? fieldKeyForLeadProperty(key);
  if (!fieldKey || !canViewLeadField(access, fieldKey)) return SNAPSHOT_NAME_KEYS.has(key) ? "" : null;
  return value;
}

function redactSnapshot(value: unknown, access: LeadFieldAccess, leadContext = false, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    try { return redactSnapshot(JSON.parse(value), access, leadContext, seen); } catch { return null; }
  }
  if (Array.isArray(value)) return value.map(item => redactSnapshot(item, access, leadContext, seen));
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  if (seen.has(value)) return null;
  seen.add(value);
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childLeadContext = leadContext || LEAD_SNAPSHOT_CONTAINERS.has(key);
    if (STAFF_KEYS.has(key)) { result[key] = child; continue; }
    if (SNAPSHOT_NAME_KEYS.has(key) && (!canViewLeadField(access, "firstName") || !canViewLeadField(access, "lastName"))) {
      result[key] = "";
      continue;
    }
    const isLeadField = SNAPSHOT_LEAD_KEYS.has(key) || key === "leadStatus" || key === "leadEmail" || key === "leadPhone";
    // A top-level order `status` is independent sales metadata; only redact status inside a linked lead object.
    if (isLeadField && (childLeadContext || key !== "status")) {
      const fieldKey = LEAD_ALIASES[key] ?? fieldKeyForLeadProperty(key);
      if (fieldKey && !canViewLeadField(access, fieldKey)) {
        result[key] = SNAPSHOT_NAME_KEYS.has(key) ? "" : null;
        continue;
      }
      if (key === "additionalInformation") {
        result[key] = redactValue(child, access, true, seen);
        continue;
      }
    }
    result[key] = redactSnapshot(child, access, childLeadContext, seen);
  }
  return result;
}

function redactValue(value: unknown, access: LeadFieldAccess, conservativeText: boolean, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) return value.map(item => redactValue(item, access, conservativeText, seen));
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  if (seen.has(value)) return null;
  seen.add(value);
  const source = value as Record<string, unknown>;
  const leadLike = "firstName" in source || "lastName" in source || "diagnosis" in source || "clinicalNotes" in source || "additionalInformation" in source;
  const input = leadLike ? redactLeadFields(source, access) as Record<string, unknown> : source;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(input)) {
    if (STAFF_KEYS.has(key)) { result[key] = child; continue; }
    if (conservativeText && SNAPSHOT_KEYS.has(key)) { result[key] = redactSnapshot(child, access); continue; }
    if (FULL_NAME_KEYS.has(key) && (!canViewLeadField(access, "firstName") || !canViewLeadField(access, "lastName"))) { result[key] = ""; continue; }
    // A sales order's status, purchase timestamp, and product are not lead profile fields.
    const fieldKey = LEAD_ALIASES[key] ?? (leadLike ? fieldKeyForLeadProperty(key) : undefined);
    if (fieldKey && !canViewLeadField(access, fieldKey)) { result[key] = key.includes("Name") ? "" : null; continue; }
    if (conservativeText && UNSTRUCTURED_KEYS.has(key)) {
      result[key] = key === "outcome" ? "Communication recorded" : typeof child === "string" && ["subject", "bodyHtml", "bodyText"].includes(key) ? "" : null;
      continue;
    }
    result[key] = redactValue(child, access, conservativeText, seen);
  }
  return result;
}
/** Project linked lead data without changing independent sales/order metadata. */
export function redactRelatedLead<T>(value: T, accessInput: LeadFieldAccess, options: { redactUnstructured?: boolean } = {}): T {
  const access = asLeadFieldAccess(accessInput);
  return redactValue(value, access, options.redactUnstructured ?? hasHiddenLeadFields(access), new WeakSet()) as T;
}
export function redactLeadText<T extends { outcome?: unknown; notes?: unknown; method?: unknown }>(value: T, accessInput: LeadFieldAccess): T {
  const access = asLeadFieldAccess(accessInput);
  if (!hasHiddenLeadFields(access)) return value;
  return { ...value, ...("notes" in value ? { notes: null } : {}), ...("outcome" in value ? { outcome: value.method === "email" ? "Email communication" : "Communication recorded" } : {}) };
}
export function requireLeadField(accessInput: LeadFieldAccess, field: string, message = "You do not have permission to edit this lead field.") {
  if (!canEditLeadField(asLeadFieldAccess(accessInput), field)) throw new TRPCError({ code: "FORBIDDEN", message });
}
export function requireLeadFieldView(accessInput: LeadFieldAccess, field: string, message = "This lead field is not available to your account.") {
  if (!canViewLeadField(asLeadFieldAccess(accessInput), field)) throw new TRPCError({ code: "NOT_FOUND", message });
}
export function requireSearchableLeadFields(accessInput: LeadFieldAccess, fields: string[], message = "Search is unavailable because one or more lead identifiers are hidden.") {
  const access = asLeadFieldAccess(accessInput);
  if (fields.some(field => !canViewLeadField(access, field))) throw new TRPCError({ code: "BAD_REQUEST", message });
}
export function canViewAnyLeadField(accessInput: LeadFieldAccess) {
  const access = asLeadFieldAccess(accessInput);
  return ["firstName", "lastName", "email", "phone", "stateCode", "status", "diagnosis", "clinicalNotes"].some(field => canViewLeadField(access, field));
}
export const shouldRedactMailContent = (access: LeadFieldAccess) => hasHiddenLeadFields(asLeadFieldAccess(access));
export function canViewUnredactedRelatedDocuments(accessInput: LeadFieldAccess) {
  const access = asLeadFieldAccess(accessInput);
  return access.role === "super_admin" || Boolean(access.permissions?.viewDocuments && access.permissions?.viewClinical && !hasHiddenLeadFields(access));
}
