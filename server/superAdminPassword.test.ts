import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  getSystemAdminCredential: vi.fn(),
  updateSystemAdminIdentifier: vi.fn(),
  updateSystemAdminLoginFailure: vi.fn(),
  recordSuccessfulSystemAdminLogin: vi.fn(),
  changeSystemAdminPassword: vi.fn(),
  upsertSystemAdminCredential: vi.fn(),
}));

vi.mock("./db", () => db);

import { SUPER_ADMIN_EMAIL } from "../shared/const";
import { ensureSuperAdmin, hashPassword, rotateSystemAdminPassword, verifyPassword } from "./auth";

describe("Super Admin password management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies the current password, hashes the replacement, and invalidates sessions", async () => {
    const current = await hashPassword("CurrentAdmin1!");
    db.getSystemAdminCredential.mockResolvedValue({
      id: 1,
      identifier: SUPER_ADMIN_EMAIL,
      passwordHash: current.hash,
      passwordSalt: current.salt,
      failedLoginCount: 0,
      lockedUntil: null,
    });

    const result = await rotateSystemAdminPassword("CurrentAdmin1!", "NewAdminPass2@");
    expect(result).toEqual({ ok: true });
    expect(db.changeSystemAdminPassword).toHaveBeenCalledOnce();
    const [hash, salt] = db.changeSystemAdminPassword.mock.calls[0];
    expect(await verifyPassword("NewAdminPass2@", salt, hash)).toBe(true);
    expect(await verifyPassword("CurrentAdmin1!", salt, hash)).toBe(false);
  });

  it("rejects the same or incorrect current password", async () => {
    expect(await rotateSystemAdminPassword("SameAdmin1!", "SameAdmin1!")).toEqual({ ok: false, reason: "same" });
    const current = await hashPassword("CurrentAdmin1!");
    db.getSystemAdminCredential.mockResolvedValue({
      id: 1,
      identifier: SUPER_ADMIN_EMAIL,
      passwordHash: current.hash,
      passwordSalt: current.salt,
      failedLoginCount: 0,
      lockedUntil: null,
    });
    expect(await rotateSystemAdminPassword("WrongAdmin1!", "NewAdminPass2@")).toMatchObject({ ok: false, reason: "invalid" });
    expect(db.changeSystemAdminPassword).not.toHaveBeenCalled();
  });

  it("does not overwrite a changed password from the bootstrap secret on restart", async () => {
    const changed = await hashPassword("AlreadyChanged1!");
    db.getSystemAdminCredential.mockResolvedValue({
      id: 1,
      identifier: SUPER_ADMIN_EMAIL,
      passwordHash: changed.hash,
      passwordSalt: changed.salt,
      failedLoginCount: 0,
      lockedUntil: null,
    });
    await ensureSuperAdmin();
    expect(db.upsertSystemAdminCredential).not.toHaveBeenCalled();
  });
});
