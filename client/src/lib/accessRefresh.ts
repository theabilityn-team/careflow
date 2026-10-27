import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { normalizePermissions } from "@shared/permissions";
export const STAFF_ACCESS_UPDATED_EVENT = "careflow:staff-access-updated";
export function accessFingerprint(access: { role?: string; isActive?: boolean; permissions?: unknown } | null | undefined): string {
  return access ? JSON.stringify([access.role, access.isActive, normalizePermissions(access.permissions)]) : "";
}
function keepsAccessIdentity(key: QueryKey) {
  const path = key[0];
  return Array.isArray(path) && (path.join(".") === "auth.me" || path.join(".") === "dashboard.access");
}
/** Cancel old in-flight payloads, clear protected data, then refetch mounted queries under new permissions. */
export async function refreshPermissionQueries(client: QueryClient) {
  const filters = { predicate: (query: { queryKey: QueryKey }) => !keepsAccessIdentity(query.queryKey) };
  await client.cancelQueries(filters);
  await client.resetQueries(filters);
}
export function notifyStaffAccessUpdated() {
  try { localStorage.setItem(STAFF_ACCESS_UPDATED_EVENT, `${Date.now()}:${Math.random()}`); } catch { /* Poll/focus refresh covers browsers that block storage. */ }
  window.dispatchEvent(new Event(STAFF_ACCESS_UPDATED_EVENT));
}
