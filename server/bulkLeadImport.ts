import { buildLeadIdentityKeys, identityMatchLabels, type LeadIdentityInput, type LeadIdentityKey } from "./leadIdentity";

export const MAX_BULK_LEADS = 10;
export const MAX_IMAGES_PER_LEAD = 6;
export const MAX_BULK_IMAGES = 20;

export type ExistingIdentityMatch = LeadIdentityKey & {
  leadId: number;
  firstName: string;
  lastName: string;
};

export type BulkDuplicateResult = {
  index: number;
  existing: { leadId: number; firstName: string; lastName: string; matchedBy: string[] } | null;
  duplicateOfIndex: number | null;
  duplicateInBatchBy: string[];
};

export function analyzeBulkLeadDuplicates(
  inputs: LeadIdentityInput[],
  existingMatches: ExistingIdentityMatch[],
): BulkDuplicateResult[] {
  const existingByHash = new Map<string, ExistingIdentityMatch[]>();
  for (const match of existingMatches) {
    const matches = existingByHash.get(match.keyHash) ?? [];
    matches.push(match);
    existingByHash.set(match.keyHash, matches);
  }

  const firstBatchIndexByHash = new Map<string, number>();
  return inputs.map((input, index) => {
    const keys = buildLeadIdentityKeys(input);
    const matchedExisting = keys.flatMap(key => existingByHash.get(key.keyHash) ?? []);
    const firstExisting = matchedExisting[0];
    const sameExistingLead = firstExisting ? matchedExisting.filter(match => match.leadId === firstExisting.leadId) : [];

    const duplicateKeys = keys.filter(key => firstBatchIndexByHash.has(key.keyHash));
    const duplicateOfIndex = duplicateKeys.length
      ? Math.min(...duplicateKeys.map(key => firstBatchIndexByHash.get(key.keyHash)!))
      : null;

    for (const key of keys) {
      if (!firstBatchIndexByHash.has(key.keyHash)) firstBatchIndexByHash.set(key.keyHash, index);
    }

    return {
      index,
      existing: firstExisting ? {
        leadId: firstExisting.leadId,
        firstName: firstExisting.firstName,
        lastName: firstExisting.lastName,
        matchedBy: identityMatchLabels(sameExistingLead),
      } : null,
      duplicateOfIndex,
      duplicateInBatchBy: identityMatchLabels(duplicateKeys),
    };
  });
}
