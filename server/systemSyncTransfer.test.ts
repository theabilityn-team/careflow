import { beforeEach, describe, expect, it, vi } from "vitest";
import * as sync from "./systemSyncDb";
import * as storage from "./storage";
import { processSyncImage } from "./systemSyncService";
import { DEFAULT_SYNC_ROOT } from "./systemSyncManus";
import { createSyncUploadGrant, finishSyncUpload } from "./systemSyncTransfer";
vi.mock("./systemSyncDb", () => ({ getSyncJob: vi.fn(), getSyncItem: vi.fn(), getSyncSettings: vi.fn(), getSyncFolder: vi.fn() }));
vi.mock("./storage", () => ({ storagePresignUpload: vi.fn(), storageReadBytes: vi.fn() }));
vi.mock("./systemSyncService", () => ({ processSyncImage: vi.fn() }));
const job = () => ({ id: 12, kind: "import", folderId: 3, status: "running", itemIds: "[4]", expiresAt: Date.now()+60000 });
const item = () => ({ id: 4, jobId: 12, folderId: 3, status: "processing", mimeType: "image/jpeg", byteSize: 6, fingerprint: "safe-fingerprint", leadId: null, documentId: null });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(sync.getSyncJob).mockResolvedValue(job() as never);
  vi.mocked(sync.getSyncItem).mockResolvedValue(item() as never);
  vi.mocked(sync.getSyncSettings).mockResolvedValue({ enabled: true, rootFolderId: DEFAULT_SYNC_ROOT } as never);
  vi.mocked(sync.getSyncFolder).mockResolvedValue({ active: true, desiredState: "running" } as never);
  vi.mocked(storage.storagePresignUpload).mockResolvedValue("https://storage.example.invalid/private-signature");
});
describe("direct system sync transfer", () => {
  it("grants only the exact server-assigned private staging object", async () => {
    const grant = await createSyncUploadGrant(12,4);
    expect(storage.storagePresignUpload).toHaveBeenCalledWith("system-sync-staging/12/4-safe-fingerprint.jpg");
    expect(grant).toEqual({ protocol: "careflow-direct-storage-v3", uploadUrl: "https://storage.example.invalid/private-signature", method: "PUT", headers: { "Content-Type": "image/jpeg" }, byteSize: 6 });
    expect(JSON.stringify(grant)).not.toContain(DEFAULT_SYNC_ROOT);
  });
  it("reads only the assigned object with a byte limit and reuses existing validation/OCR/import", async () => {
    const bytes=Buffer.from([255,216,1,2,3,4]);
    vi.mocked(storage.storageReadBytes).mockResolvedValue(bytes);
    vi.mocked(processSyncImage).mockResolvedValue({ status: "imported", leadId: 101, documentId: 201 } as never);
    expect(await finishSyncUpload(12,4)).toMatchObject({ status: "imported" });
    expect(storage.storageReadBytes).toHaveBeenCalledWith("system-sync-staging/12/4-safe-fingerprint.jpg",6);
    expect(processSyncImage).toHaveBeenCalledWith(12,4,bytes,"image/jpeg");
  });
  it.each(["imported","attached","needs_review"])("returns persisted %s without re-uploading or re-running OCR", async status => {
    vi.mocked(sync.getSyncItem).mockResolvedValue({ ...item(), status, leadId:101,documentId:201 } as never);
    expect(await createSyncUploadGrant(12,4)).toEqual({status});
    expect(await finishSyncUpload(12,4)).toMatchObject({status});
    expect(storage.storageReadBytes).not.toHaveBeenCalled();
    expect(storage.storagePresignUpload).not.toHaveBeenCalled();
    expect(processSyncImage).not.toHaveBeenCalled();
  });
  it.each(["foreign_job","foreign_item","bad_assignment","expired","paused_job","paused_folder","wrong_root","oversized","unsupported"])("rejects %s before signing or reading", async scenario => {
    if(scenario==="foreign_job")vi.mocked(sync.getSyncItem).mockResolvedValue({...item(),jobId:13} as never);
    if(scenario==="foreign_item")vi.mocked(sync.getSyncJob).mockResolvedValue({...job(),itemIds:"[5]"} as never);
    if(scenario==="bad_assignment")vi.mocked(sync.getSyncJob).mockResolvedValue({...job(),itemIds:"invalid"} as never);
    if(scenario==="expired")vi.mocked(sync.getSyncJob).mockResolvedValue({...job(),expiresAt:Date.now()-1} as never);
    if(scenario==="paused_job")vi.mocked(sync.getSyncJob).mockResolvedValue({...job(),status:"stopped"} as never);
    if(scenario==="paused_folder")vi.mocked(sync.getSyncFolder).mockResolvedValue({active:true,desiredState:"paused"} as never);
    if(scenario==="wrong_root")vi.mocked(sync.getSyncSettings).mockResolvedValue({rootFolderId:"foreign"} as never);
    if(scenario==="oversized")vi.mocked(sync.getSyncItem).mockResolvedValue({...item(),byteSize:25000001} as never);
    if(scenario==="unsupported")vi.mocked(sync.getSyncItem).mockResolvedValue({...item(),mimeType:"text/html"} as never);
    await expect(createSyncUploadGrant(12,4)).rejects.toThrow();
    await expect(finishSyncUpload(12,4)).rejects.toThrow();
    expect(storage.storagePresignUpload).not.toHaveBeenCalled();
    expect(storage.storageReadBytes).not.toHaveBeenCalled();
    expect(processSyncImage).not.toHaveBeenCalled();
  });
});
