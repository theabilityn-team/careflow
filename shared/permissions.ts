export const PERMISSION_KEYS = [
  "viewLeads",
  "createLeads",
  "editLeads",
  "scanDocuments",
  "viewClinical",
  "manageContacts",
  "manageEmails",
  "useEmailTemplates",
  "changeStatus",
  "exportData",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type Permissions = Record<PermissionKey, boolean>;

export const DEFAULT_TECHNICAL_PERMISSIONS: Permissions = {
  viewLeads: true,
  createLeads: true,
  editLeads: true,
  scanDocuments: false,
  viewClinical: false,
  manageContacts: true,
  manageEmails: false,
  useEmailTemplates: false,
  changeStatus: true,
  exportData: false,
};

export function normalizePermissions(value: unknown): Permissions {
  const source = typeof value === "object" && value && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(PERMISSION_KEYS.map(key => [key, source[key] === true])) as Permissions;
}

/** One-time stored-data upgrade only. Runtime checks never infer email access from contacts. */
export function upgradeLegacyEmailPermissions(value: Record<string, unknown>) {
  const result = { ...value };
  if (!Object.hasOwn(result, "manageEmails")) result.manageEmails = value.manageContacts === true;
  if (!Object.hasOwn(result, "useEmailTemplates")) result.useEmailTemplates = value.manageContacts === true;
  return result;
}
