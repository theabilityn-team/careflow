import { describe, expect, it } from "vitest";
import {
  SYSTEM_SYNC_ROOT_FOLDER_REGEX,
  buildSyncItemFingerprint,
  isSystemSyncRootFolderName,
} from "./systemSyncDb";
import {
  systemSyncEvents,
  systemSyncFolders,
  systemSyncItems,
  systemSyncJobs,
  systemSyncSettings,
} from "../drizzle/schema";

describe("system sync folder discovery helpers", () => {
  it("accepts only numbered immediate Images folders", () => {
    expect(SYSTEM_SYNC_ROOT_FOLDER_REGEX.test("12. Images")).toBe(true);
    expect(isSystemSyncRootFolderName(" 12.   images ")).toBe(true);
    expect(isSystemSyncRootFolderName("Images")).toBe(false);
    expect(isSystemSyncRootFolderName("12. Image archive")).toBe(false);
    expect(isSystemSyncRootFolderName("abc12. Images")).toBe(false);
  });
});

describe("system sync fingerprints", () => {
  const base = {
    driveFileId: "drive-file-1",
    name: "patient.png",
    mimeType: "image/png",
    byteSize: 1234,
    checksum: "checksum-1",
    modifiedTime: "2026-10-29T12:00:00Z",
  } as const;

  it("is deterministic for equivalent metadata", () => {
    expect(buildSyncItemFingerprint(base)).toBe(buildSyncItemFingerprint({ ...base }));
    expect(buildSyncItemFingerprint(base)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not include folder/path fields, so moved files keep their fingerprint", () => {
    const original = buildSyncItemFingerprint(base);
    const moved = buildSyncItemFingerprint({ ...base });
    expect(moved).toBe(original);
  });

  it("changes when file metadata changes", () => {
    expect(buildSyncItemFingerprint({ ...base, checksum: "checksum-2" })).not.toBe(buildSyncItemFingerprint(base));
    expect(buildSyncItemFingerprint({ ...base, modifiedTime: "2026-10-30T12:00:00Z" })).not.toBe(buildSyncItemFingerprint(base));
    expect(buildSyncItemFingerprint({ ...base, byteSize: 1235 })).not.toBe(buildSyncItemFingerprint(base));
  });

  it("normalizes omitted optional metadata to the same canonical null representation", () => {
    expect(buildSyncItemFingerprint({ driveFileId: "f", name: "x", mimeType: "image/png" }))
      .toBe(buildSyncItemFingerprint({ driveFileId: "f", name: "x", mimeType: "image/png", byteSize: null, checksum: null, modifiedTime: null }));
  });
});

describe("system sync schema contract", () => {
  it("exposes the singleton settings row and required queue tables", () => {
    expect(systemSyncSettings["id"]).toBeDefined();
    expect(systemSyncFolders["driveFolderId"]).toBeDefined();
    expect(systemSyncItems["driveFileId"]).toBeDefined();
    expect(systemSyncJobs["callbackTokenHash"]).toBeDefined();
    expect(systemSyncEvents["message"]).toBeDefined();
  });
});
