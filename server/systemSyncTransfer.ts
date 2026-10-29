import * as sync from "./systemSyncDb";
import { DEFAULT_SYNC_ROOT, SYNC_TRANSFER_PROTOCOL } from "./systemSyncManus";
import { processSyncImage } from "./systemSyncService";
import { storagePresignUpload, storageReadBytes } from "./storage";

export { SYNC_TRANSFER_PROTOCOL };

async function context(jobId: number, itemId: number) {
  const [job, item, settings] = await Promise.all([sync.getSyncJob(jobId), sync.getSyncItem(itemId), sync.getSyncSettings()]);
  let assigned: unknown; try { assigned = JSON.parse(job?.itemIds ?? "[]"); } catch {}
  if (!job || job.kind !== "import" || !item || item.jobId !== jobId || job.folderId !== item.folderId || !Array.isArray(assigned) || !assigned.includes(itemId) || !settings?.enabled || settings.rootFolderId !== DEFAULT_SYNC_ROOT) throw new Error("File is outside its assigned transfer batch.");
  if (job.expiresAt <= Date.now() || !["dispatching", "running"].includes(job.status)) throw new Error("Transfer paused or expired.");
  const folder = await sync.getSyncFolder(item.folderId);
  if (!folder?.active || folder.desiredState !== "running") throw new Error("Transfer paused or expired.");
  if (!["processing", "imported", "attached", "needs_review"].includes(item.status)) throw new Error("Transfer paused or expired.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(item.mimeType) || !item.byteSize || item.byteSize > 25_000_000) throw new Error("Unsupported source image.");
  const extension = item.mimeType === "image/png" ? "png" : item.mimeType === "image/webp" ? "webp" : "jpg";
  // This object remains unreferenced. processSyncImage copies validated bytes to
  // a separate final random key, so an outstanding PUT cannot alter a document.
  const stagingKey = `system-sync-staging/${job.id}/${item.id}-${item.fingerprint}.${extension}`;
  return { job, item, stagingKey };
}

export async function createSyncUploadGrant(jobId: number, itemId: number) {
  const { item, stagingKey } = await context(jobId, itemId);
  if (item.status !== "processing") return { status: item.status };
  return {
    protocol: SYNC_TRANSFER_PROTOCOL,
    uploadUrl: await storagePresignUpload(stagingKey),
    method: "PUT" as const,
    headers: { "Content-Type": item.mimeType },
    byteSize: item.byteSize,
  };
}

export async function finishSyncUpload(jobId: number, itemId: number) {
  const { item, stagingKey } = await context(jobId, itemId);
  if (["imported", "attached", "needs_review"].includes(item.status)) return { status: item.status, leadId: item.leadId, documentId: item.documentId };
  const bytes = await storageReadBytes(stagingKey, Math.min(item.byteSize!, 25_000_000));
  // Existing validation enforces exact source size, magic and MD5 before any
  // final storage/OCR/transaction. No client-supplied URL/key/extraction is used.
  return processSyncImage(jobId, itemId, bytes, item.mimeType);
}
