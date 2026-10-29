type OutcomeCounts = { imported?: number; attached?: number; needs_review?: number };
/** Keep each initial transfer small until the real storage/OCR pipeline has returned an outcome. */
export function syncTransferBatchSize(configured: number, folders: readonly { counts: OutcomeCounts }[]) {
  const proven = folders.some(folder => (folder.counts.imported ?? 0) + (folder.counts.attached ?? 0) + (folder.counts.needs_review ?? 0) > 0);
  return proven ? Math.max(1, Math.min(100, Math.floor(configured))) : 1;
}
