import type { Lead } from "../drizzle/schema";

export function mergeLeadPatch(current: Lead, patch: Partial<Lead>): Lead {
  return { ...current, ...patch };
}
