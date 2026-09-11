import type { Lead } from "../drizzle/schema";

export const AUDITED_LEAD_FIELDS = [
  "firstName", "lastName", "preferredLanguage", "email", "phone", "dateOfBirth", "address", "city",
  "stateProvince", "postalCode", "country", "stateCode", "diagnosisCategory", "diagnosis", "clinicalNotes",
  "additionalInformation", "sourceDocumentType", "status", "interestLevel", "assignedTo", "lastContactAt",
  "nextFollowUpAt",
] as const;

export type AuditedLeadField = (typeof AUDITED_LEAD_FIELDS)[number];
export type AuditValue = string | number | null;
export type LeadAuditChange = {
  field: AuditedLeadField;
  before: AuditValue;
  after: AuditValue;
};

const normalize = (value: unknown): AuditValue => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return value;
  return String(value);
};

export function leadSnapshot(lead: Partial<Lead>) {
  return Object.fromEntries(AUDITED_LEAD_FIELDS.map(field => [field, normalize(lead[field])])) as Record<AuditedLeadField, AuditValue>;
}

export function leadChanges(before: Partial<Lead>, after: Partial<Lead>): LeadAuditChange[] {
  const previous = leadSnapshot(before);
  const next = leadSnapshot(after);
  return AUDITED_LEAD_FIELDS
    .filter(field => previous[field] !== next[field])
    .map(field => ({ field, before: previous[field], after: next[field] }));
}

export const serializeAudit = (value: unknown) => JSON.stringify(value);

export function parseAuditJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const CLINICAL_FIELDS = new Set<AuditedLeadField>(["diagnosis", "clinicalNotes", "additionalInformation"]);

export function prepareAuditEvents<T extends {
  detail: string | null;
  changes: string | null;
  snapshotBefore: string | null;
  snapshotAfter: string | null;
}>(events: T[], canViewClinical: boolean) {
  return events.map(event => {
    const changes = parseAuditJson<LeadAuditChange[]>(event.changes, []);
    const before = parseAuditJson<Record<string, AuditValue>>(event.snapshotBefore, {});
    const after = parseAuditJson<Record<string, AuditValue>>(event.snapshotAfter, {});
    if (canViewClinical) return { ...event, changes, snapshotBefore: before, snapshotAfter: after };
    const visibleChanges = changes.filter(change => !CLINICAL_FIELDS.has(change.field));
    const redact = (snapshot: Record<string, AuditValue>) => Object.fromEntries(
      Object.entries(snapshot).filter(([field]) => !CLINICAL_FIELDS.has(field as AuditedLeadField)),
    );
    return {
      ...event,
      detail: visibleChanges.length ? event.detail : "Protected information changed",
      changes: visibleChanges,
      snapshotBefore: redact(before),
      snapshotAfter: redact(after),
    };
  });
}
