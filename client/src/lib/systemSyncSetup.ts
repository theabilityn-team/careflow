export const APPROVED_SYNC_ROOT = "1UjUahdFTNTJxzWaTTeGJfQKvhm8URhLo";

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
