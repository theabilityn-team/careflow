import { createHash } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "./db";
import {
  systemSyncEvents,
  systemSyncFolders,
  systemSyncItems,
  systemSyncJobs,
  systemSyncSettings,
} from "../drizzle/schema";

export const SYSTEM_SYNC_ROOT_FOLDER_REGEX = /^\d+\.\s*Images$/i;
export const SYSTEM_SYNC_ROOT_FOLDER_RE = SYSTEM_SYNC_ROOT_FOLDER_REGEX;

export const SYSTEM_SYNC_ITEM_STATUSES = [
  "pending",
  "processing",
  "imported",
  "attached",
  "needs_review",
  "failed",
  "skipped",
  "removed",
] as const;
export type SystemSyncItemStatus = (typeof SYSTEM_SYNC_ITEM_STATUSES)[number];

export const SYSTEM_SYNC_JOB_KINDS = ["discovery", "import"] as const;
export type SystemSyncJobKind = (typeof SYSTEM_SYNC_JOB_KINDS)[number];

export const SYSTEM_SYNC_JOB_STATUSES = [
  "created",
  "dispatching",
  "running",
  "waiting",
  "completed",
  "failed",
  "dispatch_unknown",
  "stopped",
] as const;
export type SystemSyncJobStatus = (typeof SYSTEM_SYNC_JOB_STATUSES)[number];

export const SYSTEM_SYNC_FOLDER_DESIRED_STATES = ["running", "paused", "idle"] as const;
export type SystemSyncFolderDesiredState = (typeof SYSTEM_SYNC_FOLDER_DESIRED_STATES)[number];

export function isSystemSyncRootFolderName(name: string): boolean {
  return SYSTEM_SYNC_ROOT_FOLDER_REGEX.test(name.trim());
}

export type SyncItemFingerprintInput = {
  driveFileId?: string;
  name: string;
  mimeType: string;
  byteSize?: number | null;
  checksum?: string | null;
  modifiedTime?: string | null;
};

/**
 * Fingerprints stable file metadata, deliberately excluding folderId/sourcePath so
 * a Drive move keeps the same durable item and ownership history.
 */
export function buildSyncItemFingerprint(input: SyncItemFingerprintInput): string {
  const canonical = JSON.stringify([
    input.driveFileId ?? null,
    input.name,
    input.mimeType,
    input.byteSize ?? null,
    input.checksum ?? null,
    input.modifiedTime ?? null,
  ]);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export const fingerprintSyncItem = buildSyncItemFingerprint;

async function requireSyncDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

function hasOwn<T extends object>(input: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

export type SyncSettings = typeof systemSyncSettings.$inferSelect;
export type SyncFolder = typeof systemSyncFolders.$inferSelect;
export type SyncItem = typeof systemSyncItems.$inferSelect;
export type SyncJob = typeof systemSyncJobs.$inferSelect;
export type SyncEvent = typeof systemSyncEvents.$inferSelect;

export type SaveSyncSettingsPatch = Partial<Omit<typeof systemSyncSettings.$inferInsert, "id" | "updatedAt">>;

export async function getSyncSettings(): Promise<SyncSettings | undefined> {
  const db = await requireSyncDb();
  return (await db.select().from(systemSyncSettings).where(eq(systemSyncSettings.id, 1)).limit(1))[0];
}

export async function saveSyncSettings(patch: SaveSyncSettingsPatch): Promise<SyncSettings | undefined> {
  const db = await requireSyncDb();
  const values = {
    id: 1,
    rootFolderId: patch.rootFolderId ?? "",
    connectorId: patch.connectorId ?? "",
    ...(hasOwn(patch, "publicBaseUrl") ? { publicBaseUrl: patch.publicBaseUrl ?? null } : {}),
    enabled: patch.enabled ?? false,
    maxParallel: patch.maxParallel ?? 3,
    batchSize: patch.batchSize ?? 50,
    ...(hasOwn(patch, "scheduleTaskUid") ? { scheduleTaskUid: patch.scheduleTaskUid ?? null } : {}),
    ...(hasOwn(patch, "lastCheckedAt") ? { lastCheckedAt: patch.lastCheckedAt ?? null } : {}),
  };
  const updateSet: Record<string, unknown> = {};
  for (const key of [
    "rootFolderId",
    "connectorId",
    "publicBaseUrl",
    "enabled",
    "maxParallel",
    "batchSize",
    "scheduleTaskUid",
    "lastCheckedAt",
  ] as const) {
    if (hasOwn(patch, key)) updateSet[key] = patch[key] ?? null;
  }
  if (Object.keys(updateSet).length === 0) {
    updateSet.rootFolderId = values.rootFolderId;
    updateSet.connectorId = values.connectorId;
    updateSet.enabled = values.enabled;
    updateSet.maxParallel = values.maxParallel;
    updateSet.batchSize = values.batchSize;
  }
  await db.insert(systemSyncSettings).values(values).onDuplicateKeyUpdate({ set: updateSet });
  return getSyncSettings();
}

type SyncFolderCounts = {
  total: number;
  pending: number;
  processing: number;
  imported: number;
  attached: number;
  needs_review: number;
  failed: number;
  skipped: number;
  removed: number;
};

function normalizeCount(value: unknown): number {
  return Number(value ?? 0);
}

export async function listSyncFolders(): Promise<Array<SyncFolder & { counts: SyncFolderCounts }>> {
  const db = await requireSyncDb();
  const rows = await db
    .select({
      folder: systemSyncFolders,
      total: count(systemSyncItems.id),
      pending: sql<number>`coalesce(sum(case when ${systemSyncItems.status} = 'pending' then 1 else 0 end), 0)`,
      processing: sql<number>`coalesce(sum(case when ${systemSyncItems.status} = 'processing' then 1 else 0 end), 0)`,
      imported: sql<number>`coalesce(sum(case when ${systemSyncItems.status} = 'imported' then 1 else 0 end), 0)`,
      attached: sql<number>`coalesce(sum(case when ${systemSyncItems.status} = 'attached' then 1 else 0 end), 0)`,
      needs_review: sql<number>`coalesce(sum(case when ${systemSyncItems.status} = 'needs_review' then 1 else 0 end), 0)`,
      failed: sql<number>`coalesce(sum(case when ${systemSyncItems.status} = 'failed' then 1 else 0 end), 0)`,
      skipped: sql<number>`coalesce(sum(case when ${systemSyncItems.status} = 'skipped' then 1 else 0 end), 0)`,
      removed: sql<number>`coalesce(sum(case when ${systemSyncItems.status} = 'removed' then 1 else 0 end), 0)`,
    })
    .from(systemSyncFolders)
    .leftJoin(systemSyncItems, eq(systemSyncItems.folderId, systemSyncFolders.id))
    .groupBy(systemSyncFolders.id)
    .orderBy(asc(systemSyncFolders.name));

  return rows.map(row => ({
    ...row.folder,
    counts: {
      total: normalizeCount(row.total),
      pending: normalizeCount(row.pending),
      processing: normalizeCount(row.processing),
      imported: normalizeCount(row.imported),
      attached: normalizeCount(row.attached),
      needs_review: normalizeCount(row.needs_review),
      failed: normalizeCount(row.failed),
      skipped: normalizeCount(row.skipped),
      removed: normalizeCount(row.removed),
    },
  }));
}

export async function getSyncFolder(id: number): Promise<SyncFolder | undefined> {
  const db = await requireSyncDb();
  return (await db.select().from(systemSyncFolders).where(eq(systemSyncFolders.id, id)).limit(1))[0];
}

export type ListSyncItemsOptions = {
  folderId: number;
  status?: SystemSyncItemStatus | string;
  page: number;
  pageSize: number;
};

export async function listSyncItems(options: ListSyncItemsOptions): Promise<{ items: SyncItem[]; total: number }> {
  const db = await requireSyncDb();
  const page = Math.max(1, Math.floor(options.page || 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(options.pageSize || 50)));
  const conditions = [eq(systemSyncItems.folderId, options.folderId)];
  if (options.status) conditions.push(eq(systemSyncItems.status, options.status));
  const where = and(...conditions);
  const [items, totalRows] = await Promise.all([
    db.select().from(systemSyncItems).where(where).orderBy(desc(systemSyncItems.updatedAt), asc(systemSyncItems.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count(systemSyncItems.id) }).from(systemSyncItems).where(where),
  ]);
  return { items, total: normalizeCount(totalRows[0]?.total) };
}

export async function listSyncEvents(folderId?: number): Promise<SyncEvent[]> {
  const db = await requireSyncDb();
  const query = db.select().from(systemSyncEvents);
  const rows = folderId === undefined
    ? await query.orderBy(desc(systemSyncEvents.createdAt), desc(systemSyncEvents.id)).limit(50)
    : await query.where(eq(systemSyncEvents.folderId, folderId)).orderBy(desc(systemSyncEvents.createdAt), desc(systemSyncEvents.id)).limit(50);
  return rows;
}

export type CreateSyncJobInput = {
  kind: SystemSyncJobKind;
  folderId?: number | null;
  callbackTokenHash: string;
  expiresAt: number;
  itemIds?: number[];
};

function serializeItemIds(itemIds?: number[]): string | null {
  return itemIds ? JSON.stringify(itemIds) : null;
}

export async function createSyncJob(input: CreateSyncJobInput): Promise<SyncJob | undefined> {
  const db = await requireSyncDb();
  const now = Date.now();
  const result = await db.insert(systemSyncJobs).values({
    kind: input.kind,
    folderId: input.folderId ?? null,
    status: "created",
    callbackTokenHash: input.callbackTokenHash,
    expiresAt: input.expiresAt,
    itemIds: serializeItemIds(input.itemIds),
    lastActivityAt: now,
  });
  return getSyncJob(Number(result[0].insertId));
}

export async function getSyncJob(id: number): Promise<SyncJob | undefined> {
  const db = await requireSyncDb();
  return (await db.select().from(systemSyncJobs).where(eq(systemSyncJobs.id, id)).limit(1))[0];
}

export type UpdateSyncJobPatch = Partial<Pick<SyncJob, "status" | "manusTaskId" | "manusTaskUrl" | "expiresAt" | "lastError" | "creditsUsed">> & {
  itemIds?: number[] | null;
  lastActivityAt?: number;
};

export async function updateSyncJob(id: number, patch: UpdateSyncJobPatch): Promise<SyncJob | undefined> {
  const db = await requireSyncDb();
  const updateSet: Record<string, unknown> = {};
  for (const key of ["status", "manusTaskId", "manusTaskUrl", "expiresAt", "lastError", "creditsUsed", "lastActivityAt"] as const) {
    if (hasOwn(patch, key)) updateSet[key] = patch[key] ?? null;
  }
  if (hasOwn(patch, "itemIds")) updateSet.itemIds = serializeItemIds(patch.itemIds ?? undefined);
  if (!hasOwn(patch, "lastActivityAt")) updateSet.lastActivityAt = Date.now();
  await db.update(systemSyncJobs).set(updateSet).where(eq(systemSyncJobs.id, id));
  return getSyncJob(id);
}

export async function setFolderDesiredState(id: number, state: SystemSyncFolderDesiredState): Promise<SyncFolder | undefined> {
  const db = await requireSyncDb();
  await db.update(systemSyncFolders).set({ desiredState: state }).where(eq(systemSyncFolders.id, id));
  return getSyncFolder(id);
}

export type UpdateSyncFolderPatch = Partial<Pick<SyncFolder, "active" | "status" | "desiredState" | "lastCheckedAt" | "lastStartedAt" | "lastCompletedAt" | "lastError">>;

export async function updateSyncFolder(id: number, patch: UpdateSyncFolderPatch): Promise<SyncFolder | undefined> {
  const db = await requireSyncDb();
  await db.update(systemSyncFolders).set(patch).where(eq(systemSyncFolders.id, id));
  return getSyncFolder(id);
}

export async function upsertDiscoveredFolder(input: { driveFolderId: string; name: string }): Promise<SyncFolder | undefined> {
  const db = await requireSyncDb();
  await db.insert(systemSyncFolders).values({
    driveFolderId: input.driveFolderId,
    name: input.name,
    active: true,
  }).onDuplicateKeyUpdate({ set: { name: input.name, active: true } });
  return (await db.select().from(systemSyncFolders).where(eq(systemSyncFolders.driveFolderId, input.driveFolderId)).limit(1))[0];
}

export type UpsertDiscoveredItemInput = {
  folderId: number;
  driveFileId: string;
  name: string;
  mimeType: string;
  byteSize?: number | null;
  checksum?: string | null;
  modifiedTime?: string | null;
  sourcePath?: string | null;
};

export async function upsertDiscoveredItem(input: UpsertDiscoveredItemInput): Promise<SyncItem | undefined> {
  const db = await requireSyncDb();
  const fingerprint = buildSyncItemFingerprint(input);
  return db.transaction(async tx => {
    const existing = (await tx.select().from(systemSyncItems).where(eq(systemSyncItems.driveFileId, input.driveFileId)).limit(1).for("update"))[0];
    if (!existing) {
      const result = await tx.insert(systemSyncItems).values({
        driveFileId: input.driveFileId,
        folderId: input.folderId,
        name: input.name,
        mimeType: input.mimeType,
        byteSize: input.byteSize ?? null,
        checksum: input.checksum ?? null,
        modifiedTime: input.modifiedTime ?? null,
        sourcePath: input.sourcePath ?? null,
        fingerprint,
        status: "pending",
      });
      return (await tx.select().from(systemSyncItems).where(eq(systemSyncItems.id, Number(result[0].insertId))).limit(1))[0];
    }

    const changed = existing.fingerprint !== fingerprint;
    const successful = existing.status === "imported" || existing.status === "attached" || Boolean(existing.leadId && existing.documentId);
    const status = changed
      ? (successful ? "needs_review" : "pending")
      : (existing.status === "removed" ? (existing.leadId && existing.documentId ? "attached" : "pending") : existing.status);
    const resetQueue = changed && !successful;
    await tx.update(systemSyncItems).set({
      folderId: input.folderId,
      name: input.name,
      mimeType: input.mimeType,
      byteSize: input.byteSize ?? null,
      checksum: input.checksum ?? null,
      modifiedTime: input.modifiedTime ?? null,
      sourcePath: input.sourcePath ?? null,
      fingerprint,
      ...(changed || existing.status === "removed" ? { status, lastError: null } : {}),
      ...(resetQueue ? {
        jobId: null,
        leaseUntil: null,
        completedAt: null,
        attempts: 0,
        extractionJson: null,
        uploadedFileKey: null,
        uploadedFileUrl: null,
      } : {}),
    }).where(eq(systemSyncItems.id, existing.id));
    return (await tx.select().from(systemSyncItems).where(eq(systemSyncItems.id, existing.id)).limit(1))[0];
  });
}

export async function listImportCandidates(folderId: number, limit: number): Promise<SyncItem[]> {
  const db = await requireSyncDb();
  return db.select().from(systemSyncItems)
    .where(and(eq(systemSyncItems.folderId, folderId), eq(systemSyncItems.status, "pending")))
    .orderBy(asc(systemSyncItems.id))
    .limit(Math.min(200, Math.max(1, Math.floor(limit))));
}

export async function claimSyncItems(jobId: number, itemIds: number[], leaseUntil: number): Promise<SyncItem[]> {
  if (itemIds.length === 0) return [];
  const db = await requireSyncDb();
  const now = Date.now();
  return db.transaction(async tx => {
    const rows = await tx.select().from(systemSyncItems)
      .where(and(
        inArray(systemSyncItems.id, itemIds),
        or(
          eq(systemSyncItems.status, "pending"),
          and(eq(systemSyncItems.status, "processing"), lt(systemSyncItems.leaseUntil, now)),
        ),
      ))
      .for("update");
    const ids = rows.map(row => row.id);
    if (ids.length > 0) {
      await tx.update(systemSyncItems).set({
        status: "processing",
        jobId,
        leaseUntil,
        attempts: sql`${systemSyncItems.attempts} + 1`,
        lastError: null,
      }).where(inArray(systemSyncItems.id, ids));
    }
    return tx.select().from(systemSyncItems).where(inArray(systemSyncItems.id, ids)).orderBy(asc(systemSyncItems.id));
  });
}

export type UpdateSyncItemPatch = Partial<Pick<SyncItem, "status" | "leadId" | "documentId" | "jobId" | "attempts" | "leaseUntil" | "uploadedFileKey" | "uploadedFileUrl" | "extractionJson" | "lastError" | "completedAt">>;

export async function updateSyncItem(id: number, patch: UpdateSyncItemPatch): Promise<SyncItem | undefined> {
  const db = await requireSyncDb();
  await db.update(systemSyncItems).set(patch).where(eq(systemSyncItems.id, id));
  return getSyncItem(id);
}

export async function getSyncItem(id: number): Promise<SyncItem | undefined> {
  const db = await requireSyncDb();
  return (await db.select().from(systemSyncItems).where(eq(systemSyncItems.id, id)).limit(1))[0];
}

export type AddSyncEventInput = {
  folderId?: number | null;
  itemId?: number | null;
  jobId?: number | null;
  type: string;
  message: string;
};

export async function addSyncEvent(input: AddSyncEventInput): Promise<SyncEvent | undefined> {
  const db = await requireSyncDb();
  const result = await db.insert(systemSyncEvents).values({
    folderId: input.folderId ?? null,
    itemId: input.itemId ?? null,
    jobId: input.jobId ?? null,
    type: input.type,
    message: input.message,
  });
  return (await db.select().from(systemSyncEvents).where(eq(systemSyncEvents.id, Number(result[0].insertId))).limit(1))[0];
}

function parseStoredItemIds(value: string | null): number[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => Number.isInteger(id) && id > 0);
  } catch {
    return [];
  }
}

/**
 * Appends discovery-seen SQL item IDs and records folder markers in the same
 * transaction. The job row is locked so concurrent callback pages cannot lose
 * IDs when they update the serialized item list.
 */
export type AppendDiscoverySeenInput = {
  jobId: number;
  itemIds?: number[];
  folderIds?: number[];
};

export function appendDiscoverySeen(input: AppendDiscoverySeenInput): Promise<SyncJob | undefined>;
export function appendDiscoverySeen(jobId: number, itemIds?: number[], folderIds?: number[]): Promise<SyncJob | undefined>;
export async function appendDiscoverySeen(
  inputOrJobId: AppendDiscoverySeenInput | number,
  positionalItemIds?: number[],
  positionalFolderIds?: number[],
): Promise<SyncJob | undefined> {
  const input: AppendDiscoverySeenInput = typeof inputOrJobId === "number"
    ? { jobId: inputOrJobId, itemIds: positionalItemIds, folderIds: positionalFolderIds }
    : inputOrJobId;
  const db = await requireSyncDb();
  return db.transaction(async tx => {
    const job = (await tx.select().from(systemSyncJobs)
      .where(eq(systemSyncJobs.id, input.jobId))
      .limit(1)
      .for("update"))[0];
    if (!job) return undefined;

    const ids = new Set(parseStoredItemIds(job.itemIds));
    for (const id of input.itemIds ?? []) {
      if (Number.isInteger(id) && id > 0) ids.add(id);
    }
    await tx.update(systemSyncJobs).set({
      itemIds: JSON.stringify(Array.from(ids)),
      lastActivityAt: Date.now(),
    }).where(eq(systemSyncJobs.id, input.jobId));

    const folderIds = Array.from(new Set((input.folderIds ?? []).filter(id => Number.isInteger(id) && id > 0)));
    if (folderIds.length > 0) {
      await tx.insert(systemSyncEvents).values(folderIds.map(folderId => ({
        folderId,
        jobId: input.jobId,
        type: "discovery.folder_seen",
        message: "Discovery observed the configured folder.",
      })));
    }
    const updated = await tx.select().from(systemSyncJobs)
      .where(eq(systemSyncJobs.id, input.jobId))
      .limit(1);
    return updated[0];
  });
}

/**
 * Reconciles one completed discovery under a job lock. Missing item rows are
 * retained as removed (never deleted), while folders without a seen marker are
 * deactivated. Lead/document references and history remain untouched.
 */
export async function finishDiscovery(jobId: number): Promise<SyncJob | undefined> {
  const db = await requireSyncDb();
  return db.transaction(async tx => {
    const job = (await tx.select().from(systemSyncJobs)
      .where(eq(systemSyncJobs.id, jobId))
      .limit(1)
      .for("update"))[0];
    if (!job) return undefined;

    const seenItemIds = parseStoredItemIds(job.itemIds);
    const seenFolderRows = await tx.select({ folderId: systemSyncEvents.folderId })
      .from(systemSyncEvents)
      .where(and(
        eq(systemSyncEvents.jobId, jobId),
        eq(systemSyncEvents.type, "discovery.folder_seen"),
      ));
    const seenFolderIds = Array.from(new Set(seenFolderRows
      .map(row => row.folderId)
      .filter((id): id is number => id != null)));

    if (seenItemIds.length > 0) {
      await tx.update(systemSyncItems)
        .set({ status: "removed", jobId: null, leaseUntil: null })
        .where(notInArray(systemSyncItems.id, seenItemIds));
    } else {
      await tx.update(systemSyncItems)
        .set({ status: "removed", jobId: null, leaseUntil: null });
    }
    if (seenFolderIds.length > 0) {
      await tx.update(systemSyncFolders)
        .set({ active: false })
        .where(notInArray(systemSyncFolders.id, seenFolderIds));
    } else {
      await tx.update(systemSyncFolders).set({ active: false });
    }

    await tx.update(systemSyncJobs).set({
      status: "completed",
      lastActivityAt: Date.now(),
      lastError: null,
    }).where(eq(systemSyncJobs.id, jobId));
    const updated = await tx.select().from(systemSyncJobs)
      .where(eq(systemSyncJobs.id, jobId))
      .limit(1);
    return updated[0];
  });
}

export type ReserveSyncImportJobInput = Omit<CreateSyncJobInput, "kind">;

/**
 * Reserves an import slot while holding the singleton settings row lock. A null
 * result means the configured global cap is currently full or settings are absent.
 */
export async function reserveSyncImportJob(input: ReserveSyncImportJobInput): Promise<SyncJob | null> {
  const db = await requireSyncDb();
  return db.transaction(async tx => {
    const settings = (await tx.select().from(systemSyncSettings).where(eq(systemSyncSettings.id, 1)).limit(1).for("update"))[0];
    if (!settings || !settings.enabled || input.folderId == null) return null;
    const folder = (await tx.select().from(systemSyncFolders)
      .where(eq(systemSyncFolders.id, input.folderId))
      .limit(1)
      .for("update"))[0];
    if (!folder || !folder.active || folder.desiredState !== "running") return null;
    const activeRows = await tx.select({ total: count(systemSyncJobs.id) })
      .from(systemSyncJobs)
      .where(and(
        eq(systemSyncJobs.kind, "import"),
        inArray(systemSyncJobs.status, ["created", "dispatching", "running", "waiting", "dispatch_unknown"]),
        or(
          eq(systemSyncJobs.status, "dispatch_unknown"),
          gt(systemSyncJobs.expiresAt, Date.now()),
        ),
      ));
    if (normalizeCount(activeRows[0]?.total) >= settings.maxParallel) return null;

    const now = Date.now();
    const result = await tx.insert(systemSyncJobs).values({
      kind: "import",
      folderId: input.folderId ?? null,
      status: "created",
      callbackTokenHash: input.callbackTokenHash,
      expiresAt: input.expiresAt,
      itemIds: serializeItemIds(input.itemIds),
      lastActivityAt: now,
    });
    const created = await tx.select().from(systemSyncJobs)
      .where(eq(systemSyncJobs.id, Number(result[0].insertId)))
      .limit(1);
    return created[0] ?? null;
  });
}

export type ReserveDiscoveryJobInput = Omit<CreateSyncJobInput, "kind" | "folderId" | "itemIds"> & {
  itemIds?: number[];
};

/** Reserves the single discovery lane while serializing against import admission. */
export async function reserveDiscoveryJob(input: ReserveDiscoveryJobInput): Promise<SyncJob | null> {
  const db = await requireSyncDb();
  return db.transaction(async tx => {
    const settings = (await tx.select().from(systemSyncSettings)
      .where(eq(systemSyncSettings.id, 1))
      .limit(1)
      .for("update"))[0];
    if (!settings || !settings.enabled) return null;

    const activeJobs = await tx.select({ total: count(systemSyncJobs.id) })
      .from(systemSyncJobs)
      .where(and(
        inArray(systemSyncJobs.status, ["created", "dispatching", "running", "waiting", "dispatch_unknown"]),
        or(
          eq(systemSyncJobs.status, "dispatch_unknown"),
          gt(systemSyncJobs.expiresAt, Date.now()),
        ),
      ));
    if (normalizeCount(activeJobs[0]?.total) > 0) return null;

    const runningFolders = await tx.select({ total: count(systemSyncFolders.id) })
      .from(systemSyncFolders)
      .where(and(eq(systemSyncFolders.active, true), eq(systemSyncFolders.desiredState, "running")));
    if (normalizeCount(runningFolders[0]?.total) > 0) return null;

    const now = Date.now();
    const result = await tx.insert(systemSyncJobs).values({
      kind: "discovery",
      folderId: null,
      status: "created",
      callbackTokenHash: input.callbackTokenHash,
      expiresAt: input.expiresAt,
      itemIds: serializeItemIds(input.itemIds),
      lastActivityAt: now,
    });
    const created = await tx.select().from(systemSyncJobs)
      .where(eq(systemSyncJobs.id, Number(result[0].insertId)))
      .limit(1);
    return created[0] ?? null;
  });
}
