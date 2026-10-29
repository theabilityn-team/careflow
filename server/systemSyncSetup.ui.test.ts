import { describe, expect, it, vi } from "vitest";
import {
  deriveSyncActionBlockers,
  runCheckFoldersWithSetup,
  syncSetupIsSaved,
  toSyncSetupInput,
} from "../client/src/lib/systemSyncSetup";

const savedSettings = {
  rootFolderId: "1UjUahdFTNTJxzWaTTeGJfQKvhm8URhLo",
  publicBaseUrl: "https://carecrm-ajn4jvsk.manus.space",
  enabled: true,
  maxParallel: 3,
  batchSize: 50,
};

const form = {
  publicBaseUrl: " https://carecrm-ajn4jvsk.manus.space ",
  maxParallel: "3",
  batchSize: "50",
};

describe("system sync setup UI flow", () => {
  it("recognizes a configured, unchanged setup as saved", () => {
    expect(
      syncSetupIsSaved({
        configured: true,
        settings: savedSettings,
        form,
      })
    ).toBe(true);
  });

  it("requires saving when readiness is unconfigured, disabled, or dirty", () => {
    expect(syncSetupIsSaved({ configured: false, settings: savedSettings, form })).toBe(false);
    expect(
      syncSetupIsSaved({
        configured: true,
        settings: { ...savedSettings, enabled: false },
        form,
      })
    ).toBe(false);
    expect(
      syncSetupIsSaved({
        configured: true,
        settings: savedSettings,
        form: { ...form, batchSize: "25" },
      })
    ).toBe(false);
  });

  it("saves current setup before dispatching folder discovery", async () => {
    const calls: string[] = [];
    const save = vi.fn(async (input: ReturnType<typeof toSyncSetupInput>) => {
      calls.push(`save:${input.batchSize}`);
    });
    const check = vi.fn(async () => {
      calls.push("check");
      return { jobId: 12 };
    });

    await expect(
      runCheckFoldersWithSetup({
        configured: true,
        settings: { ...savedSettings, batchSize: 25 },
        form,
        save,
        check,
      })
    ).resolves.toEqual({ jobId: 12 });

    expect(calls).toEqual(["save:50", "check"]);
    expect(save).toHaveBeenCalledWith({
      rootFolderId: savedSettings.rootFolderId,
      publicBaseUrl: savedSettings.publicBaseUrl,
      maxParallel: 3,
      batchSize: 50,
    });
  });

  it("does not dispatch when saving setup fails", async () => {
    const save = vi.fn(async () => {
      throw new Error("callback origin is invalid");
    });
    const check = vi.fn(async () => ({ jobId: 12 }));

    await expect(
      runCheckFoldersWithSetup({
        configured: false,
        settings: undefined,
        form,
        save,
        check,
      })
    ).rejects.toThrow("callback origin is invalid");
    expect(check).not.toHaveBeenCalled();
  });

  it("does not save again when setup is already current", async () => {
    const save = vi.fn(async () => undefined);
    const check = vi.fn(async () => ({ jobId: 12 }));

    await runCheckFoldersWithSetup({
      configured: true,
      settings: savedSettings,
      form,
      save,
      check,
    });

    expect(save).not.toHaveBeenCalled();
    expect(check).toHaveBeenCalledOnce();
  });

  it("blocks transfer actions while discovery is active and counts only active jobs", () => {
    expect(
      deriveSyncActionBlockers({
        jobs: [
          { kind: "discovery", status: "created" },
          { kind: "discovery", status: "dispatching" },
          { kind: "discovery", status: "running" },
          { kind: "discovery", status: "waiting" },
          { kind: "import", status: "completed" },
          { kind: "discovery", status: "stopped" },
        ],
      })
    ).toMatchObject({
      activeJobCount: 4,
      inventoryActive: true,
      importActive: false,
      transferBlocked: true,
      transferBlockerReason: "inventory",
      checkFoldersBlocked: true,
    });
  });

  it("uses the task review blocker for an unknown dispatch", () => {
    expect(
      deriveSyncActionBlockers({
        jobs: [{ kind: "import", status: "dispatch_unknown" }],
      })
    ).toMatchObject({
      activeJobCount: 1,
      taskStatusNeedsReview: true,
      transferBlocked: true,
      transferBlockerReason: "task_status_needs_review",
      checkFoldersBlocked: true,
    });
  });

  it("blocks folder checks for an active import or running desired folder", () => {
    expect(
      deriveSyncActionBlockers({
        jobs: [{ kind: "import", status: "running" }],
      })
    ).toMatchObject({
      importActive: true,
      transferBlocked: false,
      transferBlockerReason: null,
      checkFoldersBlocked: true,
    });
    expect(
      deriveSyncActionBlockers({
        folders: [{ desiredState: "running" }],
      })
    ).toMatchObject({
      runningFolder: true,
      transferBlocked: false,
      checkFoldersBlocked: true,
    });
  });
});
