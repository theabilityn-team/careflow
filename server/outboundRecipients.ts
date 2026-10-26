export function readStoredEmailAddresses(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(item => typeof item === "string" && item.length <= 320 && !/[\r\n]/.test(item)) ? parsed as string[] : [];
  } catch { return []; }
}

/** New metadata is optional in the contract for historical records and callers. */
export function hydrateOutboundRecipients<T extends { ccEmails?: string | null; bccEmails?: string | null; senderUserId?: number }>(row: T): Omit<T, "ccEmails" | "bccEmails" | "senderUserId"> & { senderUserId?: number; ccEmails?: string[]; bccEmails?: string[] } {
  return { ...row, ccEmails: readStoredEmailAddresses(row.ccEmails), bccEmails: readStoredEmailAddresses(row.bccEmails) };
}
