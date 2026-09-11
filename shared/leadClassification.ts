export const SUPPORTED_US_STATES = [
  ["FL", "Florida"],
  ["AZ", "Arizona"],
  ["NV", "Nevada"],
  ["CA", "California"],
  ["OR", "Oregon"],
] as const;

export type SupportedStateCode = (typeof SUPPORTED_US_STATES)[number][0];

type StateSource = {
  stateCode?: string | null;
  stateProvince?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
};

const STATE_ALIASES: Record<SupportedStateCode, string[]> = {
  FL: ["FL", "FLORIDA"],
  AZ: ["AZ", "ARIZONA"],
  NV: ["NV", "NEVADA"],
  CA: ["CA", "CALIFORNIA"],
  OR: ["OR", "OREGON"],
};

function normalized(value?: string | null) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function stateFromText(value?: string | null): SupportedStateCode | null {
  const text = ` ${normalized(value)} `;
  if (text.trim().length === 0) return null;
  for (const [code, aliases] of Object.entries(STATE_ALIASES) as Array<[SupportedStateCode, string[]]>) {
    if (aliases.some(alias => text.includes(` ${alias} `))) return code;
  }
  return null;
}

function stateFromZip(postalCode?: string | null): SupportedStateCode | null {
  const match = (postalCode ?? "").match(/\b(\d{5})(?:-\d{4})?\b/);
  if (!match) return null;
  const zip = Number(match[1]);
  if (zip >= 32000 && zip <= 34999) return "FL";
  if (zip >= 85000 && zip <= 86599) return "AZ";
  if (zip >= 88900 && zip <= 89899) return "NV";
  if (zip >= 90000 && zip <= 96199) return "CA";
  if (zip >= 97000 && zip <= 97999) return "OR";
  return null;
}

export function inferSupportedStateCode(source: StateSource): SupportedStateCode | null {
  return stateFromText(source.stateCode)
    ?? stateFromText(source.stateProvince)
    ?? stateFromText(source.address)
    ?? stateFromText(source.city)
    ?? stateFromZip(source.postalCode)
    ?? stateFromZip(source.address);
}
