import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as sync from "./systemSyncDb";
import { checkDriveConnector } from "./systemSyncManus";
import { checkSyncFolders, getSyncStatus } from "./systemSyncService";

vi.mock("./db", () => ({ getDb: vi.fn(async () => {
  const q: any = { then: (resolve: any) => Promise.resolve([]).then(resolve) };
  for (const key of ["from", "where", "orderBy", "limit"]) q[key] = () => q;
  return { select: () => q };
}) }));
vi.mock("./systemSyncDb", () => ({ getSyncSettings: vi.fn(), listSyncFolders: vi.fn(async () => []), listSyncEvents: vi.fn(async () => []), reserveDiscoveryJob: vi.fn() }));
vi.mock("./systemSyncManus", async () => ({ ...await vi.importActual<typeof import("./systemSyncManus")>("./systemSyncManus"), checkDriveConnector: vi.fn(async () => true) }));

const saved = { enabled: true, publicBaseUrl: "https://carecrm-ajn4jvsk.manus.space" };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MANUS_SYNC_API_KEY", "test-key");
  vi.mocked(sync.getSyncSettings).mockResolvedValue(saved as never);
  vi.mocked(checkDriveConnector).mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => ({ protocol: "careflow-drive-sync-v1", challenge: new URL(url).searchParams.get("challenge") }) })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("System sync setup readiness", () => {
  it("reports unsaved configuration independently from working key/Drive/callback", async () => {
    vi.mocked(sync.getSyncSettings).mockResolvedValue(undefined);
    const status = await getSyncStatus();
    expect(status.ready).toMatchObject({ configured: false, apiKeyPresent: true, driveConnected: true, callbackReady: true });
    await expect(checkSyncFolders()).rejects.toThrow("Save and enable Sync settings");
    expect(sync.reserveDiscoveryJob).not.toHaveBeenCalled();
  });
  it("reports saved enabled settings even when the optional inventory worker is not registered", async () => {
    expect((await getSyncStatus()).ready).toMatchObject({ configured: true, workerScheduled: false });
  });
  it("identifies a missing key instead of blaming a saved callback", async () => {
    vi.stubEnv("MANUS_SYNC_API_KEY", "");
    await expect(checkSyncFolders()).rejects.toThrow("Manus API server key is missing");
    expect(sync.reserveDiscoveryJob).not.toHaveBeenCalled();
  });
  it("identifies a missing saved callback URL", async () => {
    vi.mocked(sync.getSyncSettings).mockResolvedValue({ enabled: true, publicBaseUrl: null } as never);
    await expect(checkSyncFolders()).rejects.toThrow("Save the published CareFlow callback URL");
    expect(sync.reserveDiscoveryJob).not.toHaveBeenCalled();
  });
  it("reports Drive and deployment failures separately without reserving a paid job", async () => {
    vi.mocked(checkDriveConnector).mockResolvedValue(false);
    await expect(checkSyncFolders()).rejects.toThrow("Reconnect the approved Google Drive connector");
    vi.mocked(checkDriveConnector).mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    await expect(checkSyncFolders()).rejects.toThrow("published sync callback is unavailable");
    expect(sync.reserveDiscoveryJob).not.toHaveBeenCalled();
  });
});
