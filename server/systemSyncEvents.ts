import * as sync from "./systemSyncDb";
import { completeSyncJob, inspectSyncJob, tickSyncWorker } from "./systemSyncService";

/** Runs within a persisted, authenticated callback request, never a detached timer. */
export async function completeSyncAndAdvance(jobId: number, success: boolean, pauseFolderAfterCompletion = false) {
  const result = await completeSyncJob(jobId, success);
  if (pauseFolderAfterCompletion) {
    const job = await sync.getSyncJob(jobId);
    if (job?.kind === "import" && job.folderId) {
      await sync.updateSyncFolder(job.folderId, { desiredState: "paused", status: "paused" });
    }
  }
  await tickSyncWorker();
  return result;
}

/** The caller verifies the RSA webhook and binds the task ID to a stored job first. */
export async function handleSyncTaskStop(job: { id: number; status: string }, stopReason?: string) {
  if (stopReason === "ask" && !["completed", "failed", "stopped"].includes(job.status)) {
    await sync.updateSyncJob(job.id, {
      status: "waiting",
      lastError: "Manus task requires input; open its task link. No automatic confirmation is allowed.",
    });
    return { waiting: true };
  }
  await inspectSyncJob(job.id);
  await tickSyncWorker();
  return { waiting: false };
}
