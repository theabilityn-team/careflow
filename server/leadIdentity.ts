import { createHash } from "node:crypto";

export type LeadIdentityInput = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  postalCode?: string | null;
};

export type LeadIdentityKey = { keyType: "email" | "phone" | "profile"; keyHash: string };

const normalizeText = (value?: string | null) => (value ?? "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim()
  .replace(/\s+/g, " ");

export const normalizeEmail = (value?: string | null) => normalizeText(value);

export function normalizePhone(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return normalized.length >= 7 ? normalized : "";
}

export function normalizeDateOfBirth(value?: string | null) {
  const text = normalizeText(value);
  if (!text) return "";
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text.replace(/\D/g, "") : parsed.toISOString().slice(0, 10);
}

function hashIdentity(type: LeadIdentityKey["keyType"], value: string) {
  return createHash("sha256").update(`${type}:${value}`).digest("hex");
}

export function buildLeadIdentityKeys(input: LeadIdentityInput): LeadIdentityKey[] {
  const keys: LeadIdentityKey[] = [];
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const firstName = normalizeText(input.firstName);
  const lastName = normalizeText(input.lastName);
  const dateOfBirth = normalizeDateOfBirth(input.dateOfBirth);
  const address = normalizeText(input.address).replace(/[^a-z0-9]/g, "");
  const postalCode = normalizeText(input.postalCode).replace(/[^a-z0-9]/g, "");

  if (email) keys.push({ keyType: "email", keyHash: hashIdentity("email", email) });
  if (phone) keys.push({ keyType: "phone", keyHash: hashIdentity("phone", phone) });
  const profileValue = firstName && lastName && dateOfBirth
    ? `${firstName}|${lastName}|dob:${dateOfBirth}`
    : firstName && lastName && address && postalCode
      ? `${firstName}|${lastName}|address:${address}|${postalCode}`
      : "";
  if (profileValue) keys.push({ keyType: "profile", keyHash: hashIdentity("profile", profileValue) });
  return keys;
}

export function identityMatchLabels(keys: LeadIdentityKey[], input?: LeadIdentityInput) {
  const hasNameDob = Boolean(normalizeText(input?.firstName) && normalizeText(input?.lastName) && normalizeDateOfBirth(input?.dateOfBirth));
  return keys.map(key => key.keyType === "profile" ? (hasNameDob ? "first name + last name + date of birth" : "first name + last name + address + postal code") : key.keyType);
}

export function isDuplicateKeyError(error: unknown) {
  const candidate = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return candidate?.code === "ER_DUP_ENTRY" || candidate?.errno === 1062 || candidate?.cause?.code === "ER_DUP_ENTRY" || candidate?.cause?.errno === 1062;
}

export function isLeadDuplicateError(error: unknown): error is Error & { code: "LEAD_DUPLICATE"; leadId: number } {
  const candidate = error as { code?: string; leadId?: number };
  return candidate?.code === "LEAD_DUPLICATE" && typeof candidate.leadId === "number";
}
