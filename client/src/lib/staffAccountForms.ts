import type { PermissionKey } from "@/lib/crm";

export const DEFAULT_STAFF_ACCOUNT_PERMISSIONS: Record<PermissionKey, boolean> = {
  viewLeads: true,
  createLeads: true,
  editLeads: true,
  scanDocuments: false,
  viewClinical: false,
  manageContacts: true,
  changeStatus: true,
  exportData: false,
};

export const STAFF_PASSWORD_HINT = "10–200 characters, including an uppercase letter, a lowercase letter, and a number.";
export const normalizeStaffAccountEmail = (email: string) => email.trim().toLowerCase();

export function validStaffAccountPassword(password: string) {
  return password.length >= 10 && password.length <= 200 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password);
}

export function matchingStaffAccountPassword(password: string, confirmation: string) {
  return validStaffAccountPassword(password) && password === confirmation;
}

export function validStaffAccountIdentity(fullName: string, email: string) {
  const name = fullName.trim();
  const normalized = normalizeStaffAccountEmail(email);
  return name.length >= 2 && name.length <= 160 && normalized.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && normalized !== "admin@admin.com";
}
