export const APPROVED_SYNC_ROOT = "1UjUahdFTNTJxzWaTTeGJfQKvhm8URhLo";

export const ACTIVE_SYNC_JOB_STATES = [
  "created",
  "dispatching",
  "running",
  "waiting",
  "dispatch_unknown",
] as const;

export type SyncSetupForm = {
  publicBaseUrl: string;
  maxParallel: string;
  batchSize: string;
};

export type SyncSetupInput = {
  rootFolderId: string;
  publicBaseUrl?: string;
  maxParallel: number;
  batchSize: number;
};

export type PersistedSyncSettings = {
  rootFolderId?: string | null;
  publicBaseUrl?: string | null;
  enabled?: boolean;
  maxParallel?: number;
  batchSize?: number;
};

export type SyncSetupSavedArgs = {
  configured: boolean;
  settings?: PersistedSyncSettings | null;
  form: SyncSetupForm;
};

export type SyncBlockingJob = {
  kind?: string | null;
  status?: string | null;
};

export type SyncBlockingFolder = {
  desiredState?: string | null;
};

export type TransferBlockerReason =
  | "inventory"
  | "task_status_needs_review"
  | "import"
  | null;

export type SyncActionBlockers = {
  activeJobCount: number;
  inventoryActive: boolean;
  importActive: boolean;
  taskStatusNeedsReview: boolean;
  transferBlocked: boolean;
  transferBlockerReason: TransferBlockerReason;
  checkFoldersBlocked: boolean;
  runningFolder: boolean;
};

function boundedNumber(value: string, fallback: number, maximum: number) {
  return Math.max(1, Math.min(maximum, Number(value) || fallback));
}

export function toSyncSetupInput(form: SyncSetupForm): SyncSetupInput {
  const publicBaseUrl = form.publicBaseUrl.trim();
  return {
    rootFolderId: APPROVED_SYNC_ROOT,
    publicBaseUrl: publicBaseUrl || undefined,
    maxParallel: boundedNumber(form.maxParallel, 3, 3),
    batchSize: boundedNumber(form.batchSize, 50, 50),
  };
}

export function syncSetupNeedsSave({
  configured,
  settings,
  form,
}: SyncSetupSavedArgs) {
  if (!configured || settings?.enabled !== true) return true;

  const current = toSyncSetupInput(form);
  return (
    settings.rootFolderId !== current.rootFolderId ||
    (settings.publicBaseUrl ?? "") !== (current.publicBaseUrl ?? "") ||
    (settings.maxParallel ?? 3) !== current.maxParallel ||
    (settings.batchSize ?? 50) !== current.batchSize
  );
}

export function syncSetupIsSaved(args: SyncSetupSavedArgs) {
  return !syncSetupNeedsSave(args);
}

export function deriveSyncActionBlockers({
  jobs = [],
  folders = [],
}: {
  jobs?: readonly SyncBlockingJob[];
  folders?: readonly SyncBlockingFolder[];
}): SyncActionBlockers {
  const activeJobs = jobs.filter(job =>
    ACTIVE_SYNC_JOB_STATES.includes(
      job.status as (typeof ACTIVE_SYNC_JOB_STATES)[number]
    )
  );
  const inventoryActive = activeJobs.some(job => job.kind === "discovery");
  const importActive = activeJobs.some(job => job.kind === "import");
  const taskStatusNeedsReview = activeJobs.some(
    job => job.status === "dispatch_unknown"
  );
  const runningFolder = folders.some(folder => folder.desiredState === "running");

  // Discovery owns the transfer label while inventory is still running. An
  // unknown dispatch remains exposed separately through taskStatusNeedsReview.
  const transferBlockerReason: TransferBlockerReason = inventoryActive
      ? "inventory"
      : taskStatusNeedsReview
        ? "task_status_needs_review"
        : null;

  return {
    activeJobCount: activeJobs.length,
    inventoryActive,
    importActive,
    taskStatusNeedsReview,
    transferBlocked: inventoryActive || taskStatusNeedsReview,
    transferBlockerReason,
    checkFoldersBlocked: inventoryActive || importActive || taskStatusNeedsReview || runningFolder,
    runningFolder,
  };
}

export async function runCheckFoldersWithSetup({
  configured,
  settings,
  form,
  save,
  check,
}: SyncSetupSavedArgs & {
  save: (input: SyncSetupInput) => Promise<unknown>;
  check: () => Promise<unknown>;
}) {
  const input = toSyncSetupInput(form);
  if (syncSetupNeedsSave({ configured, settings, form })) {
    await save(input);
  }
  return check();
}
