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
    isLeader: true,
    permissions: ALL_PERMISSIONS,
  };
  const record = await getStaffPermissionRecord(user.id);
  let saved: unknown = {};
  try { saved = record?.permissions ? JSON.parse(record.permissions) : {}; } catch { /* Invalid stored permissions deny access. */ }
  const permissions = normalizePermissions(saved);
  const isActive = record?.isActive ?? false;
  const isLeader = Boolean(isActive && permissions.manageSales);
  if (isLeader) permissions.viewLeads = true;
  return {
    role: "technical_staff" as const,
    jobTitle: record?.jobTitle ?? "Technical Staff",
    isActive,
    isLeader,
    permissions,
  };
}

export function hasGlobalLeadAccess(access: { role: string; isActive: boolean; isLeader?: boolean }) {
  return access.role === "super_admin" || Boolean(access.isActive && access.isLeader);
}

export async function assertPermission(user: User, permission: PermissionKey) {
  const access = await getUserAccess(user);
  if (!access.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "Your staff account is inactive or has not been approved." });
  if (!access.permissions[permission]) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to perform this action." });
  return access;
}

export async function assertSalesAccess(user: User) {
  const access = await getUserAccess(user);
  if (!access.isActive || !access.isLeader) throw new TRPCError({ code: "FORBIDDEN", message: "Leader or Super Admin access is required for Customers and Orders." });
  return access;
}

export async function assertSalesReadAccess(user: User) {
  const access = await getUserAccess(user);
  if (!access.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "An active staff account is required to view Customers and Orders." });
  return access;
}
