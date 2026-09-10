import type { Lead } from "../drizzle/schema";

export function mergeLeadPatch(current: Lead, patch: Partial<Lead>): Lead {
  return { ...current, ...patch };
}

export function communicationLeadUpdate(input: { contactedAt: number; nextFollowUpAt?: number | null; clearFollowUp?: boolean }): Partial<Lead> {
  const update: Partial<Lead> = { lastContactAt: input.contactedAt };
  if (input.clearFollowUp) update.nextFollowUpAt = null;
  else if (input.nextFollowUpAt !== undefined && input.nextFollowUpAt !== null) update.nextFollowUpAt = input.nextFollowUpAt;
  return update;
}
