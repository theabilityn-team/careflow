import { beforeEach, describe, expect, it, vi } from "vitest";
import * as sync from "./systemSyncDb";
import { completeSyncJob, inspectSyncJob, tickSyncWorker } from "./systemSyncService";
import { completeSyncAndAdvance, handleSyncTaskStop } from "./systemSyncEvents";
vi.mock("./systemSyncDb", () => ({ updateSyncJob: vi.fn(), getSyncJob: vi.fn(), updateSyncFolder: vi.fn() }));
vi.mock("./systemSyncService", () => ({ completeSyncJob: vi.fn(), inspectSyncJob: vi.fn(), tickSyncWorker: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(completeSyncJob).mockResolvedValue({ success: true }); vi.mocked(inspectSyncJob).mockResolvedValue({ status: "stopped" }); vi.mocked(tickSyncWorker).mockResolvedValue({ started: 0 }); });
describe("Authenticated sync event continuation", () => {
  it("commits completion before advancing the queue without cron/browser", async () => {
    const calls: string[] = [];
    vi.mocked(completeSyncJob).mockImplementation(async () => { calls.push("commit"); return { success: true }; });
    vi.mocked(tickSyncWorker).mockImplementation(async () => { calls.push("continue"); return { started: 1 }; });
    expect(await completeSyncAndAdvance(10, true)).toEqual({ success: true });
    expect(calls).toEqual(["commit", "continue"]);
  });
  it("does not advance on an uncommitted completion", async () => {
    vi.mocked(completeSyncJob).mockRejectedValueOnce(new Error("unavailable"));
    await expect(completeSyncAndAdvance(10, true)).rejects.toThrow("unavailable");
    expect(tickSyncWorker).not.toHaveBeenCalled();
  });
  it("signed known-task stopped events recover handoff using provider status", async () => {
    await handleSyncTaskStop({ id: 10, status: "completed" }, "finish");
    expect(inspectSyncJob).toHaveBeenCalledWith(10);
    expect(tickSyncWorker).toHaveBeenCalledOnce();
  });
  it("asks stay waiting without confirmation or another paid dispatch", async () => {
    expect(await handleSyncTaskStop({ id: 10, status: "running" }, "ask")).toEqual({ waiting: true });
    expect(sync.updateSyncJob).toHaveBeenCalledWith(10, expect.objectContaining({ status: "waiting" }));
    expect(tickSyncWorker).not.toHaveBeenCalled();
    expect(inspectSyncJob).not.toHaveBeenCalled();
  });
  it("does not claim successful handoff when provider validation fails", async () => {
    vi.mocked(inspectSyncJob).mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(handleSyncTaskStop({ id: 10, status: "running" }, "finish")).rejects.toThrow("provider unavailable");
    expect(tickSyncWorker).not.toHaveBeenCalled();
  });
  it("pauses only the completed job's own import folder before any continuation", async () => {
    const calls: string[] = [];
    vi.mocked(sync.getSyncJob).mockResolvedValue({ id: 10, kind: "import", folderId: 7 } as never);
    vi.mocked(sync.updateSyncFolder).mockImplementation(async () => { calls.push("pause"); return undefined; });
    vi.mocked(tickSyncWorker).mockImplementation(async () => { calls.push("continue"); return { started: 0 }; });
    await completeSyncAndAdvance(10, true, true);
    expect(sync.updateSyncFolder).toHaveBeenCalledWith(7, { desiredState: "paused", status: "paused" });
    expect(calls).toEqual(["pause", "continue"]);
  });
  it("discovery completion cannot pause an arbitrary source folder", async () => {
    vi.mocked(sync.getSyncJob).mockResolvedValue({ id: 10, kind: "discovery", folderId: null } as never);
    await completeSyncAndAdvance(10, true, true);
    expect(sync.updateSyncFolder).not.toHaveBeenCalled();
  });
});
