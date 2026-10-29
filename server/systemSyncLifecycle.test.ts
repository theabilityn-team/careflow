import express from "express";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callbackHash, DEFAULT_SYNC_ROOT, SYNC_PROTOCOL, SyncProviderError } from "./systemSyncManus";
import type { TrpcContext } from "./_core/context";
import { systemSyncRouter } from "./routers/systemSync";
import { registerSystemSyncRoutes } from "./systemSyncRoutes";
import * as db from "./db";
import * as sync from "./systemSyncDb";
import * as service from "./systemSyncService";

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./systemSyncDb", () => ({
  getSyncSettings: vi.fn(),
  saveSyncSettings: vi.fn(),
  listSyncFolders: vi.fn(),
  listSyncEvents: vi.fn(),
  getSyncFolder: vi.fn(),
  listSyncItems: vi.fn(),
  createSyncJob: vi.fn(),
  getSyncJob: vi.fn(),
  updateSyncJob: vi.fn(),
  setFolderDesiredState: vi.fn(),
  updateSyncFolder: vi.fn(),
  upsertDiscoveredFolder: vi.fn(),
  upsertDiscoveredItem: vi.fn(),
  listImportCandidates: vi.fn(),
  claimSyncItems: vi.fn(),
  updateSyncItem: vi.fn(),
  getSyncItem: vi.fn(),
  addSyncEvent: vi.fn(),
  appendDiscoverySeen: vi.fn(),
  finishDiscovery: vi.fn(),
  reserveSyncImportJob: vi.fn(),
  reserveDiscoveryJob: vi.fn(),
}));

vi.mock("./systemSyncManus", async () => {
  const actual = await vi.importActual<typeof import("./systemSyncManus")>("./systemSyncManus");
  return {
    ...actual,
    checkDriveConnector: vi.fn(),
    createManusSyncTask: vi.fn(),
    getManusTask: vi.fn(),
    stopManusTask: vi.fn(),
    getManusWebhookKey: vi.fn(),
    verifyManusWebhook: vi.fn(),
  };
});

vi.mock("./systemSyncImport", () => ({
  extractSyncImage: vi.fn(),
  commitSyncExtraction: vi.fn(),
}));

vi.mock("./storage", async () => ({
  ...await vi.importActual<typeof import("./storage")>("./storage"),
  storagePut: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({
  sdk: { authenticateRequest: vi.fn() },
}));

const mockedDb = vi.mocked(db);
const mockedSync = vi.mocked(sync);

const now = new Date("2026-10-29T15:00:00.000Z");
const admin = {
  id: 1,
  openId: "qa:admin",
  name: "QA Admin",
  email: "admin@example.invalid",
  loginMethod: "local",
  role: "admin" as const,
  createdAt: now,
  updatedAt: now,
  lastSignedIn: now,
};
const staff = { ...admin, id: 2, openId: "qa:staff", name: "QA Staff", role: "user" as const };
const leader = { ...admin, id: 3, openId: "qa:leader", name: "QA Leader", role: "user" as const };

function callerContext(user: typeof admin): TrpcContext {
  return { user, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function queryResult<T>(rows: T[] = []) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.offset = vi.fn(() => query);
  query.then = (resolve: (value: T[]) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject);
  return query;
}

function installReadOnlyDb(rows: unknown[] = []) {
  mockedDb.getDb.mockResolvedValue({
    select: vi.fn(() => queryResult(rows)),
  } as never);
}

const servers: Server[] = [];

async function startRoutes() {
  const app = express();
  registerSystemSyncRoutes(app);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("System sync test server did not start.");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  installReadOnlyDb();
  delete process.env.MANUS_SYNC_API_KEY;
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.MANUS_SYNC_API_KEY;
});

describe("system sync lifecycle", () => {
  it("accepts numbered Images metadata roots and rejects non-numbered roots", async () => {
    const discoveryJob = { id: 10, kind: "discovery", status: "running", expiresAt: Date.now() + 60_000 };
    mockedSync.getSyncJob.mockResolvedValue(discoveryJob as never);
    mockedSync.upsertDiscoveredFolder.mockResolvedValue({ id: 21, driveFolderId: "folder-12", name: "12. Images", active: true } as never);
    mockedSync.listSyncFolders.mockResolvedValue([{ id: 21, driveFolderId: "folder-12", name: "12. Images", active: true }] as never);
    mockedSync.upsertDiscoveredItem.mockResolvedValue({ id: 31, mimeType: "image/png" } as never);
    mockedSync.appendDiscoverySeen.mockResolvedValue(undefined);
    mockedSync.updateSyncJob.mockResolvedValue(undefined);

    await expect(service.recordSyncMetadata(10, {
      folders: [{ driveFolderId: "folder-12", name: "12. Images" }],
      files: [{ folderDriveId: "folder-12", driveFileId: "file-1", name: "patient.png", mimeType: "image/png", byteSize: 123 }],
    })).resolves.toEqual({ accepted: 1 });
    expect(mockedSync.upsertDiscoveredFolder).toHaveBeenCalledWith({ driveFolderId: "folder-12", name: "12. Images" });
    expect(mockedSync.upsertDiscoveredItem).toHaveBeenCalledWith(expect.objectContaining({ folderId: 21, driveFileId: "file-1" }));

    await expect(service.recordSyncMetadata(10, {
      folders: [{ driveFolderId: "folder-archive", name: "12. Image archive" }],
      files: [],
    })).rejects.toThrow("Non-numbered source folder rejected.");
  });

  it("binds callback authorization to the job token and rejects expired or mismatched callbacks", async () => {
    const token = "valid-callback-token-12345678901234567890";
    const job = {
      id: 12,
      kind: "import",
      status: "running",
      folderId: 21,
      itemIds: "[]",
      callbackTokenHash: callbackHash(token),
      expiresAt: Date.now() + 60_000,
    };
    mockedSync.getSyncJob.mockResolvedValue(job as never);
    mockedSync.getSyncFolder.mockResolvedValue({ id: 21, desiredState: "running" } as never);
    const origin = await startRoutes();

    const wrongToken = await fetch(`${origin}/api/system-sync/jobs/12/manifest`, {
      headers: { authorization: `Bearer ${"wrong-token-123456789012345678901234567890"}` },
    });
    expect(wrongToken.status).toBe(401);

    mockedSync.getSyncJob.mockResolvedValue({ ...job, expiresAt: Date.now() - 1 } as never);
    const expired = await fetch(`${origin}/api/system-sync/jobs/12/manifest`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(expired.status).toBe(401);

    mockedSync.getSyncJob.mockResolvedValue(job as never);
    const valid = await fetch(`${origin}/api/system-sync/jobs/12/manifest`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toMatchObject({ eligible: true, items: [] });
  });

  it("completes an import without clearing records that already succeeded", async () => {
    const job = { id: 44, kind: "import", status: "running", folderId: 21, expiresAt: Date.now() + 60_000 };
    mockedSync.getSyncJob.mockResolvedValue(job as never);
    mockedSync.updateSyncJob.mockResolvedValue(undefined);
    const where = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where }));
    mockedDb.getDb.mockResolvedValue({ update: vi.fn(() => ({ set })), select: vi.fn(() => queryResult([{ status: "imported" }, { status: "failed" }])) } as never);

    await expect(service.completeSyncJob(44, true)).resolves.toEqual({ success: true });
    expect(set).toHaveBeenCalledWith({ status: "failed", lastError: "Transfer task ended without returning this assigned image." });
    expect(where).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).not.toMatchObject({ status: "removed", jobId: null, leadId: null, documentId: null });
    expect(mockedSync.updateSyncJob).toHaveBeenCalledWith(44, { status: "completed", lastError: null });
  });

  it("pauses all-failed batches before another paid handoff", async () => {
    mockedSync.getSyncJob.mockResolvedValue({ id: 44, kind: "import", status: "running", folderId: 21 } as never);
    const where = vi.fn(async () => undefined);
    mockedDb.getDb.mockResolvedValue({ update: vi.fn(() => ({ set: vi.fn(() => ({ where })) })), select: vi.fn(() => queryResult([{ status: "failed" }, { status: "failed" }])) } as never);
    await service.completeSyncJob(44, true);
    expect(mockedSync.updateSyncFolder).toHaveBeenCalledWith(21, expect.objectContaining({ desiredState: "paused", status: "blocked" }));
  });

  it("retains safe stage/HTTP diagnosis without storing supplied raw secret text", async () => {
    mockedSync.getSyncItem.mockResolvedValue({ id: 31, jobId: 44, status: "processing" } as never);
    await service.recordSyncFileFailure(44, 31, "upload", 413);
    expect(mockedSync.updateSyncItem).toHaveBeenCalledWith(31, expect.objectContaining({ status: "failed", lastError: expect.stringContaining("HTTP 413") }));
    await service.recordSyncFileFailure(44, 31, "download");
    expect(mockedSync.updateSyncItem).toHaveBeenLastCalledWith(31, expect.objectContaining({ lastError: expect.stringContaining("native binary download/cwd") }));
  });

  it("returns safe storage-stage diagnostics without changing pause/busy responses", async () => {
    const { StorageOperationError } = await import("./storage");
    const token = "test-callback-token-12345678901234567890";
    mockedSync.getSyncJob.mockResolvedValue({ id: 44, status: "running", callbackTokenHash: callbackHash(token), expiresAt: Date.now() + 60_000 } as never);
    const process = vi.spyOn(service, "processSyncImage");
    const origin = await startRoutes();
    const send = () => fetch(`${origin}/api/system-sync/jobs/44/image/31`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "image/jpeg" }, body: Buffer.from([255, 216, 1]) });
    process.mockRejectedValueOnce(new StorageOperationError("storage_upload", "http", 403));
    const response = await send();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Storage image upload failed (http, HTTP 403).", stage: "storage_upload", code: "http", httpStatus: 403 });
    expect(mockedSync.addSyncEvent).toHaveBeenCalledWith({ jobId: 44, itemId: 31, type: "storage_upload", message: "Storage image upload failed (http, HTTP 403)." });
    process.mockRejectedValueOnce(new Error("Image processing is busy"));
    expect((await send()).status).toBe(429);
    process.mockRejectedValueOnce(new Error("Transfer is paused"));
    expect((await send()).status).toBe(409);
    expect(mockedSync.addSyncEvent).toHaveBeenCalledTimes(1);
  });

  it("uses small authenticated direct-upload callbacks and rejects client storage URLs", async () => {
    const storage=await import("./storage");
    const token="test-direct-callback-12345678901234567890";
    mockedSync.getSyncJob.mockResolvedValue({id:44,kind:"import",folderId:21,itemIds:"[31]",status:"running",callbackTokenHash:callbackHash(token),expiresAt:Date.now()+60000} as never);
    mockedSync.getSyncItem.mockResolvedValue({id:31,folderId:21,jobId:44,status:"processing",mimeType:"image/jpeg",byteSize:3,fingerprint:"opaque"} as never);
    mockedSync.getSyncSettings.mockResolvedValue({enabled:true,rootFolderId:DEFAULT_SYNC_ROOT} as never);
    mockedSync.getSyncFolder.mockResolvedValue({active:true,desiredState:"running"} as never);
    const sign=vi.spyOn(storage,"storagePresignUpload").mockResolvedValue("https://storage.example.invalid/private");
    const read=vi.spyOn(storage,"storageReadBytes").mockResolvedValue(Buffer.from([255,216,1]));
    const process=vi.spyOn(service,"processSyncImage").mockResolvedValue({status:"imported",leadId:101,documentId:201} as never);
    const origin=await startRoutes();
    const post=(path:string,body:object={},auth=token)=>fetch(`${origin}/api/system-sync/jobs/44/${path}/31`,{method:"POST",headers:{authorization:`Bearer ${auth}`,"content-type":"application/json"},body:JSON.stringify(body)});
    expect((await post("upload",{},"wrong-token")).status).toBe(401);
    expect((await post("uploaded",{url:"http://127.0.0.1/private",key:"foreign"})).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
    const grant=await post("upload");expect(grant.status).toBe(200);expect(grant.headers.get("cache-control")).toBe("no-store");
    expect(await grant.json()).toMatchObject({protocol:"careflow-direct-storage-v3",method:"PUT",byteSize:3});
    expect(sign).toHaveBeenCalledWith("system-sync-staging/44/31-opaque.jpg");
    const done=await post("uploaded");expect(done.status).toBe(200);expect(await done.json()).toMatchObject({status:"imported"});
    expect(read).toHaveBeenCalledWith("system-sync-staging/44/31-opaque.jpg",3);
    expect(process).toHaveBeenCalledWith(44,31,Buffer.from([255,216,1]),"image/jpeg");
  });

  it("blocks staff and Leader contexts at the root admin procedure", async () => {
    mockedSync.getSyncSettings.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ protocol: "careflow-drive-sync-v1", challenge: new URL(url).searchParams.get("challenge") }),
    })));
    const caller = systemSyncRouter.createCaller(callerContext(admin));
    await expect(systemSyncRouter.createCaller(callerContext(staff)).status()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(systemSyncRouter.createCaller(callerContext(leader)).status()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.status()).resolves.toBeDefined();
  });

  it("projects item rows without callback or uploaded-secret artifacts", async () => {
    mockedSync.listSyncItems.mockResolvedValue({
      total: 1,
      items: [{
        id: 31,
        driveFileId: "file-1",
        folderId: 21,
        name: "patient.png",
        mimeType: "image/png",
        byteSize: 123,
        modifiedTime: "2026-10-29T12:00:00Z",
        status: "imported",
        attempts: 1,
        lastError: null,
        completedAt: 1_761_756_000_000,
        leadId: 101,
        documentId: 201,
        callbackTokenHash: "CALLBACK_HASH_MUST_NOT_LEAK",
        uploadedFileKey: "PRIVATE_STORAGE_KEY_MUST_NOT_LEAK",
        uploadedFileUrl: "https://private.invalid/file",
        extractionJson: "PRIVATE_PATIENT_EXTRACTION_MUST_NOT_LEAK",
      }] as never,
    });
    const result = await systemSyncRouter.createCaller(callerContext(admin)).items({ folderId: 21, page: 1, pageSize: 10 });
    expect(result).toEqual({
      total: 1,
      items: [{
        id: 31,
        driveFileId: "file-1",
        folderId: 21,
        name: "patient.png",
        mimeType: "image/png",
        byteSize: 123,
        modifiedTime: "2026-10-29T12:00:00Z",
        status: "imported",
        attempts: 1,
        lastError: null,
        completedAt: 1_761_756_000_000,
        leadId: 101,
        documentId: 201,
      }],
    });
    expect(JSON.stringify(result)).not.toContain("CALLBACK_HASH_MUST_NOT_LEAK");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_STORAGE_KEY_MUST_NOT_LEAK");
  });

  it("does not retry an ambiguous paid task.create dispatch", async () => {
    process.env.MANUS_SYNC_API_KEY = "test-server-key";
    mockedSync.getSyncSettings.mockResolvedValue({
      id: 1,
      rootFolderId: "root-drive",
      connectorId: "connector",
      publicBaseUrl: "https://careflow.manus.computer/",
      enabled: true,
      maxParallel: 3,
      batchSize: 50,
      scheduleTaskUid: null,
      lastCheckedAt: null,
    } as never);
    mockedSync.reserveDiscoveryJob.mockResolvedValue({
      id: 77,
      kind: "discovery",
      status: "created",
      folderId: null,
      callbackTokenHash: "a".repeat(64),
      expiresAt: Date.now() + 60_000,
      itemIds: null,
      lastActivityAt: Date.now(),
    } as never);
    mockedSync.updateSyncJob.mockResolvedValue(undefined);
    const { checkDriveConnector, createManusSyncTask } = await import("./systemSyncManus");
    vi.mocked(checkDriveConnector).mockResolvedValue(true);
    vi.mocked(createManusSyncTask).mockRejectedValue(new SyncProviderError("network", true));
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const challenge = new URL(String(input)).searchParams.get("challenge");
      return { ok: true, json: async () => ({ protocol: SYNC_PROTOCOL, challenge }) } as Response;
    }));

    await expect(service.checkSyncFolders()).rejects.toBeInstanceOf(SyncProviderError);
    expect(vi.mocked(createManusSyncTask)).toHaveBeenCalledTimes(1);
    expect(mockedSync.updateSyncJob).toHaveBeenLastCalledWith(77, {
      status: "dispatch_unknown",
      lastError: "Task dispatch outcome is unknown. Inspect the linked Manus account before retrying; no automatic paid retry was started.",
    });
  });
});
