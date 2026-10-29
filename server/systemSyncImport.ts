import { enrichAuditValues } from "./auditIdentity";
import { and, eq, inArray } from "drizzle-orm";
import { isDuplicateKeyError, buildLeadIdentityKeys, normalizeDateOfBirth, normalizeEmail, normalizePhone } from "./leadIdentity";
import { getDb } from "./db";
import { leadDocuments, leadIdentityKeys, leads, auditEvents, systemSyncFolders, systemSyncItems, systemSyncJobs } from "../drizzle/schema";
import { SYSTEM_ADMIN_ACTOR_ID } from "../shared/const";
import { extractScannerImages, normalizeScannerExtraction } from "./scannerExtraction";
import { storagePut } from "./storage";

export const MAX_SYNC_IMAGE_BYTES = 25_000_000;
export const SYNC_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type SyncImageMimeType = (typeof SYNC_IMAGE_MIME_TYPES)[number];

export class SyncImageValidationError extends Error {
  constructor(public readonly code: "unsupported_mime" | "oversized" | "empty", message: string) {
    super(message);
    this.name = "SyncImageValidationError";
  }
}

export async function extractSyncImage(bytes: Buffer | Uint8Array, mimeType: string): Promise<Record<string, unknown>> {
  if (!SYNC_IMAGE_MIME_TYPES.includes(mimeType as SyncImageMimeType)) {
    throw new SyncImageValidationError("unsupported_mime", "The Drive file is not a supported image type.");
  }
  if (!bytes.byteLength) throw new SyncImageValidationError("empty", "The Drive image is empty.");
  if (bytes.byteLength > MAX_SYNC_IMAGE_BYTES) throw new SyncImageValidationError("oversized", "The Drive image exceeds the 25 MB limit.");
  const dataUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  return extractScannerImages([{ dataUrl, mimeType: mimeType as SyncImageMimeType }]);
}

type SyncItemRow = {
  id: number;
  driveFileId: string;
  folderId: number;
  name: string;
  mimeType: string;
  status: string;
  leadId: number | null;
  documentId: number | null;
  jobId: number | null;
  leaseUntil: number | null;
  uploadedFileKey?: string | null;
  uploadedFileUrl?: string | null;
};
type SyncJobRow = { id: number; kind: string; status: string; expiresAt: number; lastActivityAt?: number };
type SyncFolderRow = { id: number; name: string; driveFolderId: string; desiredState: string };
type LeadRow = { id: number; firstName: string; lastName: string; dateOfBirth: string | null };
type IdentityMatch = { leadId: number; keyType: "email" | "phone" | "profile"; keyHash: string };

type SyncImportTransaction = {
  lockContext(itemId: number, jobId: number): Promise<{ item: SyncItemRow; job: SyncJobRow; folder: SyncFolderRow } | null>;
  findIdentityMatches(hashes: string[]): Promise<IdentityMatch[]>;
  getLead(leadId: number): Promise<LeadRow | null>;
  createLead(values: Record<string, unknown>): Promise<number>;
  createIdentityKeys(leadId: number, keys: Array<{ keyType: "email" | "phone" | "profile"; keyHash: string }>): Promise<void>;
  createDocument(values: Record<string, unknown>): Promise<number>;
  createAudit(values: Record<string, unknown>): Promise<void>;
  updateItem(itemId: number, values: Record<string, unknown>): Promise<void>;
  updateJob(jobId: number, values: Record<string, unknown>): Promise<void>;
};

export type SyncImportRepository = {
  transaction<T>(callback: (tx: SyncImportTransaction) => Promise<T>): Promise<T>;
};

export type CommitSyncExtractionInput = {
  itemId: number;
  jobId: number;
  bytes?: Buffer | Uint8Array;
  mimeType?: string;
  extraction: Record<string, unknown>;
  stored: { key: string; url: string };
};

export type SyncCommitResult = { status: "imported" | "attached" | "needs_review"; leadId?: number; documentId?: number };

function isUnclearIdentityValue(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return !text || ["unknown", "unclear", "not available", "n/a", "na", "none", "-"].includes(text);
}

export function isPlausibleSyncDateOfBirth(value: unknown, now = Date.now()) {
  if (isUnclearIdentityValue(value)) return false;
  const raw = String(value).trim();
  const canonical = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  const year = canonical ? Number(canonical[1]) : slash ? Number(slash[3]) : NaN;
  const month = canonical ? Number(canonical[2]) : slash ? Number(slash[1]) : NaN;
  const day = canonical ? Number(canonical[3]) : slash ? Number(slash[2]) : NaN;
  if (![year, month, day].every(Number.isInteger)) return false;
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() + 1 !== month || calendarDate.getUTCDate() !== day) return false;
  const normalized = normalizeDateOfBirth(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const [normalizedYear] = normalized.split("-").map(Number);
  const currentYear = new Date(now).getUTCFullYear();
  return normalizedYear >= 1900 && normalizedYear <= currentYear && calendarDate.getTime() <= now;
}

export function syncExtractionReviewReason(extraction: Record<string, unknown>) {
  const firstName = extraction.firstName;
  const lastName = extraction.lastName;
  const dateOfBirth = extraction.dateOfBirth;
  if (isUnclearIdentityValue(firstName) || isUnclearIdentityValue(lastName)) return "Critical patient name is missing or unclear.";
  if (!isPlausibleSyncDateOfBirth(dateOfBirth)) return "Critical patient date of birth is missing, invalid, or unclear.";
  const confidence = Number(extraction.overallConfidence);
  if (!Number.isFinite(confidence) || confidence < 0.85) return "Extraction confidence is below the verified-import threshold.";
  const warnings = Array.isArray(extraction.reviewWarnings) ? extraction.reviewWarnings.map(String) : [];
  if (warnings.some(warning => /(first|last|surname|patient\s+name|date\s+of\s+birth|dob|identity|conflict|ambiguous|unclear)/i.test(warning))) {
    return "The extraction contains an identity ambiguity or conflict warning.";
  }
  return null;
}

function normalizedName(value: unknown) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

function safeExtractionJson(extraction: Record<string, unknown>) {
  return JSON.stringify(extraction);
}

async function buildDrizzleRepository(): Promise<SyncImportRepository> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return {
    transaction: callback => db.transaction(async tx => callback({
      lockContext: async (itemId, jobId) => {
        const item = (await tx.select().from(systemSyncItems).where(eq(systemSyncItems.id, itemId)).limit(1).for("update"))[0] as SyncItemRow | undefined;
        const job = (await tx.select().from(systemSyncJobs).where(eq(systemSyncJobs.id, jobId)).limit(1).for("update"))[0] as SyncJobRow | undefined;
        if (!item || !job) return null;
        const folder = (await tx.select().from(systemSyncFolders).where(eq(systemSyncFolders.id, item.folderId)).limit(1).for("update"))[0] as SyncFolderRow | undefined;
        return folder ? { item, job, folder } : null;
      },
      findIdentityMatches: async hashes => hashes.length
        ? await tx.select({ leadId: leadIdentityKeys.leadId, keyType: leadIdentityKeys.keyType, keyHash: leadIdentityKeys.keyHash }).from(leadIdentityKeys).where(inArray(leadIdentityKeys.keyHash, hashes)).for("update") as IdentityMatch[]
        : [],
      getLead: async leadId => ((await tx.select({ id: leads.id, firstName: leads.firstName, lastName: leads.lastName, dateOfBirth: leads.dateOfBirth }).from(leads).where(eq(leads.id, leadId)).limit(1)).at(0) as LeadRow | undefined) ?? null,
      createLead: async values => Number((await tx.insert(leads).values(values as typeof leads.$inferInsert))[0].insertId),
      createIdentityKeys: async (leadId, keys) => { if (keys.length) await tx.insert(leadIdentityKeys).values(keys.map(key => ({ leadId, ...key }))); },
      createDocument: async values => Number((await tx.insert(leadDocuments).values(values as typeof leadDocuments.$inferInsert))[0].insertId),
      createAudit: async values => { await tx.insert(auditEvents).values(enrichAuditValues(values as typeof auditEvents.$inferInsert)); },
      updateItem: async (itemId, values) => { await tx.update(systemSyncItems).set(values).where(eq(systemSyncItems.id, itemId)); },
      updateJob: async (jobId, values) => { await tx.update(systemSyncJobs).set(values).where(eq(systemSyncJobs.id, jobId)); },
    })),
  };
}

async function commitOnce(input: CommitSyncExtractionInput, repository: SyncImportRepository, now: number): Promise<SyncCommitResult> {
  const normalizedExtraction = normalizeScannerExtraction(input.extraction as Record<string, any>) as Record<string, unknown>;
  return repository.transaction(async tx => {
    const context = await tx.lockContext(input.itemId, input.jobId);
    if (!context) throw new Error("Sync item or job was not found.");
    const { item, job, folder } = context;

    if (item.jobId !== input.jobId) throw new Error("Sync item is not assigned to this job.");
    if (["imported", "attached"].includes(item.status) && item.leadId && item.documentId) {
      return { status: item.status as "imported" | "attached", leadId: item.leadId, documentId: item.documentId };
    }
    if (job.kind !== "import" || !["dispatching", "running"].includes(job.status) || job.expiresAt <= now) throw new Error("Sync job is not active.");
    if (item.status !== "processing") throw new Error("Sync item is not processing.");
    if (folder.desiredState !== "running") throw new Error("Sync folder is paused.");
    if (!item.leaseUntil || item.leaseUntil < now) throw new Error("Sync item lease has expired.");

    const extractionJson = safeExtractionJson(normalizedExtraction);
    const reviewReason = syncExtractionReviewReason(normalizedExtraction);
    const baseItemPatch = {
      extractionJson,
      uploadedFileKey: input.stored.key,
      uploadedFileUrl: input.stored.url,
      lastError: reviewReason,
      completedAt: reviewReason ? now : null,
      leaseUntil: null,
    };
    if (reviewReason) {
      await tx.updateItem(item.id, { ...baseItemPatch, status: "needs_review" });
      await tx.updateJob(job.id, { lastActivityAt: now });
      return { status: "needs_review" };
    }

    const firstName = String(normalizedExtraction.firstName).trim();
    const lastName = String(normalizedExtraction.lastName).trim();
    const dateOfBirth = String(normalizedExtraction.dateOfBirth).trim();
    const identityKeys = buildLeadIdentityKeys({
      firstName,
      lastName,
      dateOfBirth,
      email: String(normalizedExtraction.email ?? "").trim(),
      phone: String(normalizedExtraction.phone ?? "").trim(),
    });
    const profileKey = identityKeys.find(key => key.keyType === "profile");
    if (!profileKey) {
      await tx.updateItem(item.id, { ...baseItemPatch, status: "needs_review", lastError: "A strict name + surname + date-of-birth profile key could not be built." });
      return { status: "needs_review" };
    }
    const matches = await tx.findIdentityMatches(identityKeys.map(key => key.keyHash));
    const profileMatches = matches.filter(match => match.keyType === "profile");
    const nonProfileMatches = matches.filter(match => match.keyType !== "profile");
    const distinctProfileLeadIds = Array.from(new Set(profileMatches.map(match => match.leadId)));
    if (distinctProfileLeadIds.length > 1 || (nonProfileMatches.length > 0 && distinctProfileLeadIds.length === 0) || (distinctProfileLeadIds.length === 1 && nonProfileMatches.some(match => match.leadId !== distinctProfileLeadIds[0]))) {
      await tx.updateItem(item.id, { ...baseItemPatch, status: "needs_review", lastError: "Email or phone identity collides with another lead." });
      return { status: "needs_review" };
    }

    let leadId: number;
    let resultStatus: "imported" | "attached";
    if (distinctProfileLeadIds.length === 1) {
      leadId = distinctProfileLeadIds[0];
      const existing = await tx.getLead(leadId);
      if (!existing || normalizedName(existing.firstName) !== normalizedName(firstName) || normalizedName(existing.lastName) !== normalizedName(lastName) || normalizeDateOfBirth(existing.dateOfBirth) !== normalizeDateOfBirth(dateOfBirth)) {
        await tx.updateItem(item.id, { ...baseItemPatch, status: "needs_review", lastError: "The matched profile did not verify against the existing lead." });
        return { status: "needs_review" };
      }
      resultStatus = "attached";
    } else {
      leadId = await tx.createLead({
        firstName,
        lastName,
        email: normalizeEmail(String(normalizedExtraction.email ?? "").trim()) || null,
        phone: String(normalizedExtraction.phone ?? "").trim() || null,
        dateOfBirth,
        address: String(normalizedExtraction.address ?? "").trim() || null,
        city: String(normalizedExtraction.city ?? "").trim() || null,
        stateProvince: String(normalizedExtraction.stateProvince ?? "").trim() || null,
        postalCode: String(normalizedExtraction.postalCode ?? "").trim() || null,
        country: String(normalizedExtraction.country ?? "").trim() || null,
        diagnosis: String(normalizedExtraction.diagnosis ?? "").trim() || null,
        diagnosisCategory: String(normalizedExtraction.diagnosisCategory ?? "").trim() || null,
        stateCode: String(normalizedExtraction.stateCode ?? "").trim() || null,
        clinicalNotes: String(normalizedExtraction.clinicalNotes ?? "").trim() || null,
        additionalInformation: Array.isArray(normalizedExtraction.additionalInformation) ? JSON.stringify(normalizedExtraction.additionalInformation) : null,
        sourceDocumentType: String(normalizedExtraction.documentCategory ?? "regular"),
        status: "verified",
        interestLevel: "unknown",
        assignedTo: null,
        createdBy: SYSTEM_ADMIN_ACTOR_ID,
      });
      await tx.createIdentityKeys(leadId, identityKeys);
      resultStatus = "imported";
    }

    const documentId = await tx.createDocument({ leadId, fileName: item.name, mimeType: item.mimeType || input.mimeType || "application/octet-stream", fileKey: input.stored.key, fileUrl: input.stored.url, uploadedBy: SYSTEM_ADMIN_ACTOR_ID });
    await tx.createAudit({ leadId, actorId: SYSTEM_ADMIN_ACTOR_ID, action: resultStatus === "imported" ? "lead.created_from_system_sync" : "lead.document_attached_from_system_sync", source: "system_sync", detail: `Drive file ${item.driveFileId} (${item.name}) from folder ${folder.driveFolderId} (${folder.name})`, changes: JSON.stringify([{ field: "sourceDocument", after: item.driveFileId }]), snapshotBefore: null, snapshotAfter: null, occurredAt: now });
    await tx.updateItem(item.id, { ...baseItemPatch, status: resultStatus, leadId, documentId, lastError: null, completedAt: now });
    await tx.updateJob(job.id, { lastActivityAt: now });
    return { status: resultStatus, leadId, documentId };
  });
}

export async function commitSyncExtraction(input: CommitSyncExtractionInput, options?: { repository?: SyncImportRepository; now?: number }) {
  const repository = options?.repository ?? await buildDrizzleRepository();
  const now = options?.now ?? Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await commitOnce(input, repository, now);
    } catch (error) {
      if (attempt === 0 && isDuplicateKeyError(error)) continue;
      throw error;
    }
  }
  throw new Error("Sync import could not be committed.");
}

export async function uploadSyncImage(itemId: number, fileName: string, bytes: Buffer | Uint8Array, mimeType: string) {
  if (!SYNC_IMAGE_MIME_TYPES.includes(mimeType as SyncImageMimeType)) throw new SyncImageValidationError("unsupported_mime", "The Drive file is not a supported image type.");
  if (bytes.byteLength > MAX_SYNC_IMAGE_BYTES) throw new SyncImageValidationError("oversized", "The Drive image exceeds the 25 MB limit.");
  return storagePut(`system-sync/${itemId}/${fileName}`, bytes, mimeType);
}
