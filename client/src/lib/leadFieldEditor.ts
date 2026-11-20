import {
  LEAD_FIELD_DEFINITIONS,
  LEAD_FIELD_MODES,
  canEditAdditionalItem,
  fieldKeyForLeadProperty,
  getLeadFieldMode,
  normalizeLeadFields,
  type LeadFieldAccess,
  type LeadFieldMode,
  type LeadFieldPermissions,
} from "@shared/leadFieldPermissions";

export type StructuredLeadRow = {
  section?: string;
  label: string;
  value: string;
  [key: string]: unknown;
};

export type LeadFieldStaffIdentity = {
  id: number;
  name?: string | null;
  email?: string | null;
  jobTitle?: string | null;
  isActive?: boolean;
  isLeader?: boolean;
  role?: string;
  accessRole?: string;
  permissions?: Record<string, boolean> | unknown;
  leadFields?: unknown;
};

export const leadFieldModeLabel: Record<LeadFieldMode, string> = {
  hide: "Hide",
  view: "View only",
  edit: "Edit",
};

export function leadFieldPermissionSnapshot(value: unknown): LeadFieldPermissions {
  return normalizeLeadFields(value);
}

export function confirmLeadFieldSave(expected: Partial<LeadFieldPermissions>, response: unknown): LeadFieldPermissions {
  const result = response as { success?: unknown; leadFields?: unknown; appliedAccess?: { leadFields?: unknown } } | null;
  if (result?.success !== true) throw new Error("Saved lead field access could not be verified. Refresh this page and try again.");
  const raw = Object.hasOwn(result, "leadFields") ? result.leadFields : result.appliedAccess?.leadFields;
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || LEAD_FIELD_DEFINITIONS.some(field => !Object.hasOwn(raw, field.key) || !LEAD_FIELD_MODES.includes((raw as Record<string, LeadFieldMode>)[field.key]))) {
    throw new Error("Saved lead field access could not be verified. Refresh this page and try again.");
  }
  const applied = normalizeLeadFields(raw);
  for (const key of Object.keys(expected)) {
    if (!LEAD_FIELD_DEFINITIONS.some(field => field.key === key) || applied[key] !== expected[key]) {
      throw new Error("Saved lead field access could not be verified. Refresh this page and try again.");
    }
  }
  return applied;
}

/** Synchronous guard: a second click is ignored before React can repaint disabled state. */
export function createLeadFieldSaveGuard() {
  let busy = false;
  return async <T>(save: () => Promise<T>): Promise<T | undefined> => {
    if (busy) return undefined;
    busy = true;
    try { return await save(); } finally { busy = false; }
  };
}

export function additionalRowsText(rows: StructuredLeadRow[]): string | null {
  return rows.length ? JSON.stringify(rows.map(row => ({ ...row, value: row.value }))) : null;
}

function normalizedValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

const PATCHABLE_PROPERTIES = [
  "firstName", "lastName", "preferredLanguage", "email", "phone", "dateOfBirth", "address", "city", "stateProvince", "postalCode", "country",
  "stateCode", "diagnosisCategory", "sourceDocumentType", "status", "interestLevel", "assignedTo", "diagnosis", "clinicalNotes",
] as const;

/**
 * Build a patch from only changed fields the viewer can edit. Address is treated as
 * one user-facing field, but each editable address component is still sent separately.
 * Additional information is a projection of changed editable rows; the server merges it.
 */
export function buildLeadFieldPatch(
  initial: Record<string, unknown>,
  draft: Record<string, unknown>,
  access: LeadFieldAccess | null | undefined,
  initialRows: StructuredLeadRow[] = [],
  draftRows: StructuredLeadRow[] = initialRows,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const property of PATCHABLE_PROPERTIES) {
    const key = fieldKeyForLeadProperty(property);
    if (!key || !getLeadFieldMode(access, key).includes("edit")) continue;
    const before = normalizedValue(initial[property]);
    const after = normalizedValue(draft[property]);
    if (before === after) continue;
    if (["email", "phone", "dateOfBirth", "address", "city", "stateProvince", "postalCode", "country", "diagnosis", "clinicalNotes"].includes(property)) {
      patch[property] = after.trim() || null;
    } else if (property === "assignedTo") {
      patch[property] = after === "" || after === "unassigned" ? null : Number(after);
    } else {
      patch[property] = after;
    }
  }

  const seen = new Map<string, number>();
  const changedRows = draftRows.flatMap(row => {
    const identity = `${row.section ?? ""}\u0000${row.label}`;
    const occurrence = seen.get(identity) ?? 0;
    seen.set(identity, occurrence + 1);
    const original = initialRows.filter(candidate => `${candidate.section ?? ""}\u0000${candidate.label}` === identity)[occurrence];
    const rowKey = { section: row.section, label: row.label };
    // Additional rows are resolved by their section/label, including Other.
    const rowEditable = canEditAdditionalItem(access, row);
    if (!rowEditable) return [];
    if (!original || normalizedValue(original.value) !== normalizedValue(row.value)) {
      return [{ ...rowKey, ...(original ? { _occurrence: occurrence } : {}), value: row.value }];
    }
    return [];
  });
  if (changedRows.length) patch.additionalInformation = additionalRowsText(changedRows);
  return patch;
}

export { LEAD_FIELD_DEFINITIONS, LEAD_FIELD_MODES, normalizeLeadFields };
