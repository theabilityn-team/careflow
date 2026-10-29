import { describe, expect, it } from "vitest";
import { buildLeadIdentityKeys } from "./leadIdentity";
import {
  commitSyncExtraction,
  extractSyncImage,
  isPlausibleSyncDateOfBirth,
  MAX_SYNC_IMAGE_BYTES,
  SyncImageValidationError,
  syncExtractionReviewReason,
  type SyncImportRepository,
} from "./systemSyncImport";

const extraction = (overrides: Record<string, unknown> = {}) => ({
  firstName: "Ada",
  lastName: "Lovelace",
  dateOfBirth: "1985-12-10",
  email: "ada@example.com",
  phone: "+1 (305) 555-0100",
  address: "1 Analytical Engine Way",
  city: "Miami",
  stateProvince: "Florida",
  postalCode: "33101",
  country: "USA",
  stateCode: "FL",
  diagnosis: "",
  diagnosisCategory: "",
  clinicalNotes: "",
  documentCategory: "regular",
  additionalInformation: [],
  reviewWarnings: [],
  overallConfidence: 0.95,
  ...overrides,
});

function repository(options: { item?: Partial<any>; job?: Partial<any>; folder?: Partial<any>; matches?: any[]; existingLead?: any } = {}) {
  const state = {
    item: { id: 7, driveFileId: "drive-file-7", folderId: 3, name: "Ada.png", mimeType: "image/png", status: "processing", leadId: null, documentId: null, jobId: 9, leaseUntil: 2_000, ...options.item },
    job: { id: 9, kind: "import", status: "running", expiresAt: 3_000, ...options.job },
    folder: { id: 3, name: "01. Images", driveFolderId: "drive-folder-3", desiredState: "running", ...options.folder },
    matches: options.matches ?? [],
    existingLead: options.existingLead ?? null,
    leads: [] as any[],
    documents: [] as any[],
    audits: [] as any[],
    itemUpdates: [] as any[],
    jobUpdates: [] as any[],
  };
  const repo: SyncImportRepository = {
    transaction: async callback => callback({
      lockContext: async () => ({ item: state.item, job: state.job, folder: state.folder }),
      findIdentityMatches: async () => state.matches,
      getLead: async () => state.existingLead,
      createLead: async values => { const id = 100 + state.leads.length; state.leads.push({ id, ...values }); return id; },
      createIdentityKeys: async () => undefined,
      createDocument: async values => { const id = 200 + state.documents.length; state.documents.push({ id, ...values }); return id; },
      createAudit: async values => { state.audits.push(values); },
      updateItem: async (_id, values) => { Object.assign(state.item, values); state.itemUpdates.push(values); },
      updateJob: async (_id, values) => { Object.assign(state.job, values); state.jobUpdates.push(values); },
    }),
  };
  return { repo, state };
}

describe("system sync import gates", () => {
  it("rejects unsupported and oversized images before OCR", async () => {
    await expect(extractSyncImage(Buffer.from("x"), "image/gif")).rejects.toMatchObject<Partial<SyncImageValidationError>>({ code: "unsupported_mime" });
    await expect(extractSyncImage(Buffer.alloc(MAX_SYNC_IMAGE_BYTES + 1), "image/png")).rejects.toMatchObject<Partial<SyncImageValidationError>>({ code: "oversized" });
  });

  it("requires a plausible canonical DOB and verified confidence", () => {
    expect(isPlausibleSyncDateOfBirth("1985-12-10", Date.parse("2026-01-01"))).toBe(true);
    expect(isPlausibleSyncDateOfBirth("02/31/1980")).toBe(false);
    expect(syncExtractionReviewReason(extraction({ overallConfidence: 0.84 }))).toContain("confidence");
    expect(syncExtractionReviewReason(extraction({ dateOfBirth: "" }))).toContain("date of birth");
    expect(syncExtractionReviewReason(extraction({ reviewWarnings: ["Patient DOB is ambiguous"] }))).toContain("ambiguity");
  });

  it("creates a verified system lead and document atomically", async () => {
    const { repo, state } = repository();
    const result = await commitSyncExtraction({ itemId: 7, jobId: 9, extraction: extraction(), stored: { key: "system-sync/a", url: "/manus-storage/system-sync/a" } }, { repository: repo, now: 1_000 });
    expect(result).toMatchObject({ status: "imported", leadId: 100, documentId: 200 });
    expect(state.leads[0]).toMatchObject({ status: "verified", createdBy: 30001, assignedTo: null });
    expect(state.documents[0]).toMatchObject({ uploadedBy: 30001, leadId: 100 });
    expect(state.item.status).toBe("imported");
    expect(state.audits).toHaveLength(1);
  });

  it("routes profile matches to attachment without overwriting the lead", async () => {
    const keys = buildLeadIdentityKeys(extraction());
    const { repo, state } = repository({
      matches: [{ leadId: 44, keyType: "profile", keyHash: keys.find(key => key.keyType === "profile")?.keyHash }],
      existingLead: { id: 44, firstName: "Ada", lastName: "Lovelace", dateOfBirth: "1985-12-10" },
    });
    const result = await commitSyncExtraction({ itemId: 7, jobId: 9, extraction: extraction({ email: "" }), stored: { key: "k", url: "/u" } }, { repository: repo, now: 1_000 });
    expect(result).toMatchObject({ status: "attached", leadId: 44 });
    expect(state.leads).toHaveLength(0);
    expect(state.documents[0]).toMatchObject({ leadId: 44 });
  });

  it("sends an email or phone collision with another identity to review", async () => {
    const keys = buildLeadIdentityKeys(extraction());
    const emailKey = keys.find(key => key.keyType === "email")!;
    const { repo, state } = repository({ matches: [{ leadId: 88, keyType: "email", keyHash: emailKey.keyHash }] });
    const result = await commitSyncExtraction({ itemId: 7, jobId: 9, extraction: extraction(), stored: { key: "k", url: "/u" } }, { repository: repo, now: 1_000 });
    expect(result).toEqual({ status: "needs_review" });
    expect(state.item.lastError).toContain("collides");
    expect(state.leads).toHaveLength(0);
  });

  it("returns the same IDs for a repeated terminal commit", async () => {
    const { repo, state } = repository({ item: { status: "imported", leadId: 55, documentId: 66 } });
    const result = await commitSyncExtraction({ itemId: 7, jobId: 9, extraction: extraction(), stored: { key: "k", url: "/u" } }, { repository: repo, now: 1_000 });
    expect(result).toEqual({ status: "imported", leadId: 55, documentId: 66 });
    expect(state.leads).toHaveLength(0);
  });

  it("rejects paused folders and expired leases before writes", async () => {
    const paused = repository({ folder: { desiredState: "paused" } });
    await expect(commitSyncExtraction({ itemId: 7, jobId: 9, extraction: extraction(), stored: { key: "k", url: "/u" } }, { repository: paused.repo, now: 1_000 })).rejects.toThrow("paused");
    const expired = repository({ item: { leaseUntil: 999 } });
    await expect(commitSyncExtraction({ itemId: 7, jobId: 9, extraction: extraction(), stored: { key: "k", url: "/u" } }, { repository: expired.repo, now: 1_000 })).rejects.toThrow("lease");
    expect(expired.state.leads).toHaveLength(0);
  });
});
