import { canViewAdditionalItem, canViewLeadField, fieldKeyForAdditionalItem, fieldKeyForLeadProperty, hasHiddenLeadFields, type LeadFieldAccess } from "@shared/leadFieldPermissions";
/** UI safety net for access changes while older query data is cached. Server projection is authoritative. */
export function maskLeadFieldsForDisplay<T extends object>(lead: T, access: LeadFieldAccess | null | undefined): T {
  const result: Record<string, unknown> = { ...lead as Record<string, unknown> };
  for (const property of Object.keys(result)) {
    const key = fieldKeyForLeadProperty(property);
    if (key && !canViewLeadField(access, key)) result[property] = key === "firstName" || key === "lastName" ? "" : null;
  }
  if (typeof result.additionalInformation === "string" && hasHiddenLeadFields(access)) {
    try {
      const parsed: unknown = JSON.parse(result.additionalInformation);
      const rows = Array.isArray(parsed) ? parsed.filter(item => item && typeof item.label === "string" && typeof item.value === "string" && fieldKeyForAdditionalItem(item) !== "otherInformation" && canViewAdditionalItem(access, item)).map(item => ({ section: item.section, label: item.label, value: item.value })) : [];
      result.additionalInformation = rows.length ? JSON.stringify(rows) : null;
    } catch { result.additionalInformation = null; }
  }
  return result as T;
}
function maskAuditSnapshot(value: unknown, access: LeadFieldAccess | null | undefined): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const safe = maskLeadFieldsForDisplay(value as Record<string, unknown>, access);
  return Object.fromEntries(Object.entries(safe).filter(([property, child]) => child !== null && child !== undefined && (property === "additionalInformation" || Boolean(fieldKeyForLeadProperty(property) && canViewLeadField(access, fieldKeyForLeadProperty(property)!)))));
}
/** Keep actor/action/time metadata, but never display hidden field labels or old before/after values. */
export function maskLeadAuditForDisplay<T extends object>(events: T[], access: LeadFieldAccess | null | undefined): T[] {
  if (!hasHiddenLeadFields(access)) return events;
  return events.map(event => {
    const source = event as Record<string, unknown>;
    const changes = Array.isArray(source.changes) ? source.changes.flatMap(change => {
      if (!change || typeof change.field !== "string") return [];
      if (change.field === "additionalInformation") {
        const before = maskLeadFieldsForDisplay({ additionalInformation: change.before }, access).additionalInformation;
        const after = maskLeadFieldsForDisplay({ additionalInformation: change.after }, access).additionalInformation;
        return before || after ? [{ field: change.field, before, after }] : [];
      }
      const key = fieldKeyForLeadProperty(change.field);
      return key && canViewLeadField(access, key) ? [{ field: change.field, before: change.before, after: change.after }] : [];
    }) : [];
    return { ...source, detail: null, changes, snapshotBefore: maskAuditSnapshot(source.snapshotBefore, access), snapshotAfter: maskAuditSnapshot(source.snapshotAfter, access) } as T;
  });
}
export function maskLeadCommunicationsForDisplay<T extends object>(items: T[], access: LeadFieldAccess | null | undefined): T[] {
  if (!hasHiddenLeadFields(access)) return items;
  return items.map(item => ({ ...item, notes: null, outcome: "Communication recorded" }));
}
export function canSearchLeadIdentity(access: LeadFieldAccess | null | undefined) {
  return ["firstName", "lastName", "email", "phone", "address"].every(key => canViewLeadField(access, key));
}

/** Re-mask old mail cache without leaking recipients, free text or tracked URLs. */
export function maskMailMessageForDisplay<T extends object>(message: T, access: LeadFieldAccess | null | undefined): T {
  if (!hasHiddenLeadFields(access)) return message;
  const source = message as Record<string, unknown>;
  return { ...source, subject: "Protected message", bodyHtml: "", bodyText: "", ccEmails: [], bccEmails: [], trackedLinks: [], trackingLinks: [], error: source.error ? "Delivery failed. Ask Super Admin to review the delivery." : null, ...(!canViewLeadField(access, "email") ? { recipientEmail: null } : {}), ...(!canViewLeadField(access, "firstName") || !canViewLeadField(access, "lastName") ? { recipientName: null } : {}) } as T;
}
