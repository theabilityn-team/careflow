import {
  additionalItemPermissionKeys,
  canEditAdditionalItem,
  canViewAdditionalItem,
  canViewLeadField,
  canViewUnredactedDocuments,
  canEditLeadField,
  hasHiddenLeadFields,
  LEAD_FIELD_DEFINITIONS,
  LEAD_FIELD_KEYS,
  fieldKeyForAdditionalItem,
  fieldKeyForLeadProperty,
  type LeadFieldAccess,
} from "@shared/leadFieldPermissions";
import type { AdditionalInformationItem } from "@shared/referralDocuments";
import { parseAuditJson } from "./leadAudit";

export type { LeadFieldAccess };

export class LeadFieldAccessError extends Error {
  code = "LEAD_FIELD_FORBIDDEN" as const;
}

export class LeadFieldInputError extends Error {
  code = "LEAD_FIELD_INVALID" as const;
}

const requiredIdentityFields = new Set(["firstName", "lastName"]);
const nullableFieldKeys = new Set([
  "email", "phone", "dateOfBirth", "address", "preferredLanguage", "stateCode", "diagnosisCategory", "diagnosis",
  "clinicalNotes", "sourceDocumentType", "status", "interestLevel", "assignedTo", "lastContactAt", "nextFollowUpAt",
]);
const identityInternalKeys = new Set(["identityHash", "keyHash", "identityKey", "identityKeys", "keyType"]);

function hiddenValue(key: string, value: unknown) {
  if (requiredIdentityFields.has(key)) return "";
  if (nullableFieldKeys.has(key)) return null;
  if (typeof value === "number") return null;
  return null;
}

/** Redact every known lead field while preserving the legacy response shape. */
export function redactLeadFields<T extends object>(lead: T, access: LeadFieldAccess): T {
  const output: Record<string, unknown> = { ...(lead as Record<string, unknown>) };
  identityInternalKeys.forEach(key => delete output[key]);
  for (const property of Object.keys(output)) {
    const key = fieldKeyForLeadProperty(property);
    if (key && !canViewLeadField(access, key)) output[property] = hiddenValue(key, output[property]);
  }
  if ("additionalInformation" in output) {
    output.additionalInformation = redactAdditionalInformation(output.additionalInformation as string | null | undefined, access);
  }
  return output as T;
}

function parseAdditional(value: string | null | undefined): AdditionalInformationItem[] | null {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every(item => item && typeof item === "object" && typeof (item as { label?: unknown }).label === "string" && typeof (item as { value?: unknown }).value === "string" && ((item as { section?: unknown }).section === undefined || typeof (item as { section?: unknown }).section === "string"))) return null;
    return parsed as AdditionalInformationItem[];
  } catch {
    return null;
  }
}

function safeAdditionalRow(item: AdditionalInformationItem): AdditionalInformationItem {
  const row: AdditionalInformationItem = { label: item.label, value: item.value };
  if (item.section !== undefined) row.section = item.section;
  if (typeof item.confidence === "number" && Number.isFinite(item.confidence)) row.confidence = item.confidence;
  return row;
}

/** Keep only permissioned structured rows. Unknown rows are unsafe whenever any field is hidden. */
export function redactAdditionalInformation(value: string | null | undefined, access: LeadFieldAccess): string | null {
  if (value == null) return null;
  if (!hasHiddenLeadFields(access)) return value;
  const parsed = parseAdditional(value);
  if (!parsed) return null;
  const rows = parsed
    .filter(item => fieldKeyForAdditionalItem(item) !== "otherInformation")
    .filter(item => canViewAdditionalItem(access, item))
    .map(safeAdditionalRow);
  return rows.length ? JSON.stringify(rows) : null;
}

function redactAuditChange(change: Record<string, unknown>, access: LeadFieldAccess): Record<string, unknown> | null {
  const field = typeof change.field === "string" ? change.field : undefined;
  if (!field) return null;
  const key = fieldKeyForLeadProperty(field) ?? (LEAD_FIELD_KEYS.includes(field) ? field : undefined);
  if (field !== "additionalInformation" && (!key || !canViewLeadField(access, key))) return null;
  const output: Record<string, unknown> = { field };
  if (field === "additionalInformation") {
    output.before = typeof change.before === "string" ? redactAdditionalInformation(change.before, access) : null;
    output.after = typeof change.after === "string" ? redactAdditionalInformation(change.after, access) : null;
  } else {
    output.before = change.before;
    output.after = change.after;
  }
  return output;
}

function redactAuditChanges(value: unknown, access: LeadFieldAccess): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(change => {
    if (!change || typeof change !== "object" || Array.isArray(change)) return [];
    const safe = redactAuditChange(change as Record<string, unknown>, access);
    return safe ? [safe] : [];
  });
}

function redactAuditSnapshot(value: unknown, access: LeadFieldAccess): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const known: Record<string, unknown> = {};
  for (const [property, value] of Object.entries(source)) {
    if (property === "additionalInformation") { known[property] = typeof value === "string" ? redactAdditionalInformation(value, access) : null; continue; }
    const key = fieldKeyForLeadProperty(property);
    if (key && canViewLeadField(access, key)) known[property] = value;
  }
  return known;
}

/** Redact prepared or raw audit history without exposing protected change values. */
export function redactLeadAuditEvents<T extends object>(events: T[], access: LeadFieldAccess): T[] {
  return events.map(event => {
    const source = event as Record<string, unknown>;
    const changes = typeof source.changes === "string"
      ? parseAuditJson<unknown[]>(source.changes, [])
      : Array.isArray(source.changes) ? source.changes : [];
    const before = typeof source.snapshotBefore === "string"
      ? parseAuditJson<Record<string, unknown>>(source.snapshotBefore, {})
      : source.snapshotBefore;
    const after = typeof source.snapshotAfter === "string"
      ? parseAuditJson<Record<string, unknown>>(source.snapshotAfter, {})
      : source.snapshotAfter;
    const hidden = hasHiddenLeadFields(access);
    return {
      ...source,
      detail: hidden ? "Lead activity recorded" : source.detail,
      changes: hidden ? redactAuditChanges(changes, access) : changes,
      snapshotBefore: hidden ? redactAuditSnapshot(before, access) : before,
      snapshotAfter: hidden ? redactAuditSnapshot(after, access) : after,
    } as T;
  });
}

function parseAdditionalForMerge(value: unknown): AdditionalInformationItem[] {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value as AdditionalInformationItem[];
  if (typeof value !== "string") throw new LeadFieldInputError("Additional information must be structured JSON.");
  const parsed = parseAdditional(value);
  if (!parsed) throw new LeadFieldInputError("Additional information is malformed.");
  return parsed;
}

type AdditionalPatchItem = AdditionalInformationItem & { _occurrence?: unknown };

function additionalPatchKey(item: AdditionalInformationItem) {
  return `${item.section ?? ""}\u0000${item.label}`;
}

function validateAdditionalPatchItem(item: AdditionalPatchItem): number | undefined {
  if (Object.hasOwn(item, "_occurrence")) {
    if (!Number.isInteger(item._occurrence) || Number(item._occurrence) < 0) {
      throw new LeadFieldInputError("Additional information row occurrence is invalid.");
    }
    return Number(item._occurrence);
  }
  return undefined;
}

function stripPatchMetadata(item: AdditionalPatchItem): AdditionalInformationItem {
  const { _occurrence: _ignored, ...row } = item;
  return row;
}

/** Merge a partial row update without replacing protected rows or allowing read-only changes. */
export function mergeAdditionalInformation(current: string | null | undefined, patch: string | null | undefined, access: LeadFieldAccess): string | null {
  if (patch === undefined) return current ?? null;
  const before = parseAdditionalForMerge(current);
  const incoming = parseAdditionalForMerge(patch) as AdditionalPatchItem[];
  const rowsByKey = new Map<string, AdditionalInformationItem[]>();
  before.forEach(item => {
    const rows = rowsByKey.get(additionalPatchKey(item)) ?? [];
    rows.push(item);
    rowsByKey.set(additionalPatchKey(item), rows);
  });
  const replacements = new Map<number, AdditionalInformationItem>();
  const removals = new Set<number>();
  const appended: AdditionalInformationItem[] = [];
  const touched = new Set<number>();
  for (const rawItem of incoming) {
    const occurrence = validateAdditionalPatchItem(rawItem);
    const item = stripPatchMetadata(rawItem);
    const key = additionalPatchKey(item);
    const candidates = rowsByKey.get(key) ?? [];
    const targetOccurrence = occurrence ?? (candidates.length <= 1 ? 0 : (() => {
      throw new LeadFieldInputError(`Additional information row is ambiguous: ${item.label}`);
    })());
    const target = candidates[targetOccurrence];
    if (!target) {
      if (occurrence !== undefined) throw new LeadFieldInputError(`Additional information row occurrence does not exist: ${item.label}`);
      if (!canEditAdditionalItem(access, item)) throw new LeadFieldAccessError(`Additional information row is not editable: ${item.label}`);
      appended.push(item);
      continue;
    }
    const targetIndex = before.indexOf(target);
    if (touched.has(targetIndex)) throw new LeadFieldInputError("Additional information row is supplied more than once.");
    touched.add(targetIndex);
    if (!canViewAdditionalItem(access, target) || !canEditAdditionalItem(access, target)) {
      if (JSON.stringify(item) !== JSON.stringify(target)) throw new LeadFieldAccessError(`Additional information row is not editable: ${target.label}`);
      continue;
    }
    if (item.value === "") removals.add(targetIndex);
    else replacements.set(targetIndex, { ...target, value: item.value });
  }
  const merged = before.flatMap((item, index) => removals.has(index) ? [] : [replacements.get(index) ?? item]);
  merged.push(...appended.filter(item => item.value !== ""));
  return merged.length ? JSON.stringify(merged) : null;
}

export function assertLeadPatchEditable(values: Record<string, unknown>, access: LeadFieldAccess, options: { allowRowOccurrences?: boolean } = { allowRowOccurrences: true }) {
  for (const [property, value] of Object.entries(values)) {
    const key = fieldKeyForLeadProperty(property);
    if (key) {
      if (!canEditLeadField(access, key)) throw new LeadFieldAccessError(`Lead field is not editable: ${key}`);
      if (key === "lastContactAt") throw new LeadFieldAccessError("Most recent contact is read-only.");
    }
    if (property === "additionalInformation" && value !== undefined) {
      for (const item of parseAdditionalForMerge(value) as AdditionalPatchItem[]) {
        const occurrence = validateAdditionalPatchItem(item);
        if (occurrence !== undefined && !options.allowRowOccurrences) throw new LeadFieldInputError("New rows cannot reference an existing row occurrence.");
        if (!canEditAdditionalItem(access, item)) throw new LeadFieldAccessError(`Additional information row is not editable: ${item.label}`);
      }
    }
  }
}

export function allLeadInformationEditable(access: LeadFieldAccess) {
  return LEAD_FIELD_DEFINITIONS.filter(definition => !("readOnly" in definition && definition.readOnly)).every(definition => canEditLeadField(access, definition.key));
}

export function fieldSettingsForAccess(access: LeadFieldAccess) {
  return Object.fromEntries(LEAD_FIELD_DEFINITIONS.map(definition => [definition.key, canEditLeadField(access, definition.key) ? "edit" : canViewLeadField(access, definition.key) ? "view" : "hide"]));
}

export { canEditAdditionalItem, canViewAdditionalItem, canEditLeadField, canViewLeadField, canViewUnredactedDocuments, hasHiddenLeadFields, additionalItemPermissionKeys };
