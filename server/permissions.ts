import { TRPCError } from "@trpc/server";
import type { User } from "../drizzle/schema";
import { getStaffPermissionRecord } from "./db";
import { normalizePermissions, PERMISSION_KEYS, type Permissions } from "../shared/permissions";
export { DEFAULT_TECHNICAL_PERMISSIONS, normalizePermissions, PERMISSION_KEYS } from "../shared/permissions";
export type { PermissionKey, Permissions } from "../shared/permissions";
import type { PermissionKey } from "../shared/permissions";

export const ALL_PERMISSIONS: Permissions = Object.fromEntries(PERMISSION_KEYS.map(key => [key, true])) as Permissions;

export async function getUserAccess(user: User) {
  if (user.role === "admin") return {
    role: "super_admin" as const,
    jobTitle: "Super Administrator",
    isActive: true,
    permissions: ALL_PERMISSIONS,
  };
  const record = await getStaffPermissionRecord(user.id);
  let saved: unknown = {};
  try { saved = record?.permissions ? JSON.parse(record.permissions) : {}; } catch { /* Invalid stored permissions deny access. */ }
  return {
    role: "technical_staff" as const,
    jobTitle: record?.jobTitle ?? "Technical Staff",
    isActive: record?.isActive ?? false,
    permissions: normalizePermissions(saved),
  };
}

export async function assertPermission(user: User, permission: PermissionKey) {
  const access = await getUserAccess(user);
  if (!access.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "Your staff account is inactive or has not been approved." });
  if (!access.permissions[permission]) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to perform this action." });
  return access;
}
