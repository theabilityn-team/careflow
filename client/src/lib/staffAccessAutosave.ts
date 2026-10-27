import { normalizePermissions, PERMISSION_KEYS, type Permissions, type PermissionKey } from "@shared/permissions";

export type StaffAccessValues = { userId: number; jobTitle: string; isActive: boolean; permissions: Permissions };
export function staffAccessSnapshot(member: { id: number; jobTitle?: string | null; isActive: boolean; permissions: unknown }): StaffAccessValues {
  return { userId: member.id, jobTitle: member.jobTitle || "Technical Staff", isActive: Boolean(member.isActive), permissions: normalizePermissions(member.permissions) };
}
export function staffPermissionChange(saved: StaffAccessValues, key: PermissionKey, enabled: boolean): StaffAccessValues {
  return { ...saved, permissions: { ...saved.permissions, [key]: enabled } };
}
export function confirmStaffAccessSave(expected: StaffAccessValues, response: unknown): StaffAccessValues {
  const value = response as { success?: unknown; appliedAccess?: { jobTitle?: unknown; isActive?: unknown; permissions?: Record<string, unknown> } } | null;
  const applied = value?.appliedAccess;
  if (value?.success !== true || !applied || applied.jobTitle !== expected.jobTitle.trim() || applied.isActive !== expected.isActive || PERMISSION_KEYS.some(key => applied.permissions?.[key] !== expected.permissions[key])) {
    throw new Error("Saved permissions could not be verified. Refresh this page and try again.");
  }
  return { ...expected, jobTitle: expected.jobTitle.trim(), permissions: normalizePermissions(applied.permissions) };
}
/** Lock is synchronous, before React has time to paint a disabled switch. */
export function createStaffAccessSaveGuard() {
  let busy = false;
  return async <T>(save: () => Promise<T>): Promise<T | undefined> => {
    if (busy) return undefined;
    busy = true;
    try { return await save(); } finally { busy = false; }
  };
}
