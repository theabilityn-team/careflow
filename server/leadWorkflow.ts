import type { Lead } from "../drizzle/schema";

export function communicationLeadUpdate(input: { contactedAt: number; nextFollowUpAt?: number | null }): Partial<Lead> {
  const update: Partial<Lead> = { lastContactAt: input.contactedAt };
  if (input.nextFollowUpAt !== undefined && input.nextFollowUpAt !== null) update.nextFollowUpAt = input.nextFollowUpAt;
  return update;
}
