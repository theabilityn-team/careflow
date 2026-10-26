const MAX_EMAIL_LENGTH = 320;
const MAX_RECIPIENTS_PER_LIST = 20;
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function validateEmailAddress(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error("Email recipients cannot contain line breaks.");
  const address = value.trim().toLowerCase();
  if (!address) throw new Error("Email recipient cannot be empty.");
  if (address.length > MAX_EMAIL_LENGTH) throw new Error("Email recipient is too long.");
  if (!EMAIL_PATTERN.test(address)) throw new Error("Enter valid email recipients.");
  return address;
}

/** Parse a comma- or semicolon-separated recipient list into normalized addresses. */
export function parseEmailAddressList(text: string): string[] {
  if (typeof text !== "string") throw new Error("Enter valid email recipients.");
  if (/[\r\n]/.test(text)) throw new Error("Email recipients cannot contain line breaks.");
  if (!text.trim()) return [];

  const parts = text.split(/[,;]/).map(part => part.trim());
  if (parts.some(part => !part)) throw new Error("Email recipient cannot be empty.");
  if (parts.length > MAX_RECIPIENTS_PER_LIST) throw new Error("CC and BCC can contain at most 20 recipients each.");
  return parts.map(validateEmailAddress);
}

export type NormalizedMailRecipients = {
  to: string;
  cc: string[];
  bcc: string[];
};

/** Normalize To/CC/BCC and remove case-insensitive duplicates in To, then CC, then BCC order. */
export function normalizeMailRecipients(input: { to: string; cc?: string[]; bcc?: string[] }): NormalizedMailRecipients {
  const to = parseEmailAddressList(input.to);
  if (to.length !== 1) throw new Error("Enter exactly one To recipient.");

  const cc = input.cc ?? [];
  const bcc = input.bcc ?? [];
  if (!Array.isArray(cc) || !Array.isArray(bcc)) throw new Error("CC and BCC recipients must be lists.");
  if (cc.length > MAX_RECIPIENTS_PER_LIST || bcc.length > MAX_RECIPIENTS_PER_LIST) {
    throw new Error("CC and BCC can contain at most 20 recipients each.");
  }

  const seen = new Set<string>(to);
  const normalizedCc: string[] = [];
  for (const value of cc) {
    if (typeof value !== "string") throw new Error("Enter valid email recipients.");
    const address = validateEmailAddress(value);
    if (!seen.has(address)) {
      seen.add(address);
      normalizedCc.push(address);
    }
  }
  const normalizedBcc: string[] = [];
  for (const value of bcc) {
    if (typeof value !== "string") throw new Error("Enter valid email recipients.");
    const address = validateEmailAddress(value);
    if (!seen.has(address)) {
      seen.add(address);
      normalizedBcc.push(address);
    }
  }
  return { to: to[0], cc: normalizedCc, bcc: normalizedBcc };
}
