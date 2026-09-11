import { TRPCError } from "@trpc/server";
import type { User } from "../drizzle/schema";
import { getStaffPermissionRecord } from "./db";

export const PERMISSION_KEYS = [
  "viewLeads",
  "createLeads",
  "editLeads",
  "scanDocuments",
  "viewClinical",
  "manageContacts",
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
  changeStatus: true,
  exportData: false,
};

export const ALL_PERMISSIONS: Permissions = Object.fromEntries(
  PERMISSION_KEYS.map(key => [key, true]),
) as Permissions;

export function normalizePermissions(value: unknown): Permissions {
  const source = typeof value === "object" && value ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    PERMISSION_KEYS.map(key => [key, source[key] === true]),
  ) as Permissions;
}

export async function getUserAccess(user: User) {
  if (user.role === "admin") {
    return {
      role: "super_admin" as const,
      jobTitle: "Super Administrator",
      isActive: true,
      permissions: ALL_PERMISSIONS,
    };
  }

  const record = await getStaffPermissionRecord(user.id);
  return {
    role: "technical_staff" as const,
    jobTitle: record?.jobTitle ?? "Technical Staff",
    isActive: record?.isActive ?? false,
    permissions: record ? normalizePermissions(JSON.parse(record.permissions)) : normalizePermissions({}),
  };
}

export async function assertPermission(user: User, permission: PermissionKey) {
  const access = await getUserAccess(user);
  if (!access.isActive) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your staff account is inactive or has not been approved." });
  }
  if (!access.permissions[permission]) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to perform this action." });
  }
  return access;
}
