import { afterEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ADMIN_ACTOR_ID } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";
import { mergeStaffSmtpSettings, publicStaffSmtpSettings } from "./routers/emailSettings";

const stored = {
  userId: 17,
  smtpHost: "smtp.example.com",
  smtpPort: 587,
  smtpSecurity: "starttls" as const,
  smtpUsername: "staff@example.com",
  smtpPassword: "stored-plain-secret",
  fromEmail: "staff@example.com",
  fromName: "Staff Member",
  replyToEmail: null,
  isEnabled: true,
  verifiedAt: 1_789_000_000_000,
  lastTestedAt: 1_789_000_000_000,
  lastTestError: null,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  updatedAt: new Date("2026-09-01T00:00:00Z"),
};

const input = {
  smtpHost: "smtp.example.com",
  smtpPort: 587,
  smtpSecurity: "starttls" as const,
  smtpUsername: "staff@example.com",
  fromEmail: "staff@example.com",
  fromName: "Staff Member",
  replyToEmail: "",
  isEnabled: true,
};

function context(role: "admin" | "user", id: number): TrpcContext {
  const now = new Date();
  return {
    user: { id, openId: role === "admin" ? "system:super-admin" : `staff:${id}`, name: role === "admin" ? "Super Administrator" : "Staff Member", email: role === "admin" ? "admin@admin.com" : "staff@example.com", loginMethod: "local", role, createdAt: now, updatedAt: now, lastSignedIn: now },
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

afterEach(() => vi.restoreAllMocks());

describe("SMTP settings authorization and API shaping", () => {
  it("lets Super Admin manage the dedicated system SMTP row", async () => {
    const get = vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue({ ...stored, userId: SYSTEM_ADMIN_ACTOR_ID, fromEmail: "admin@admin.com" });
    const result = await appRouter.createCaller(context("admin", SYSTEM_ADMIN_ACTOR_ID)).emailSettings.get();
    expect(get).toHaveBeenCalledWith(SYSTEM_ADMIN_ACTOR_ID);
    expect(result).toMatchObject({ mode: "manage", userId: SYSTEM_ADMIN_ACTOR_ID, isSuperAdmin: true, fromEmail: "admin@admin.com", hasPassword: true });
    expect("smtpPassword" in result).toBe(false);
  });

  it("lets Super Admin save SMTP settings for a selected technical staff account", async () => {
    const now = new Date();
    vi.spyOn(db, "getUserById").mockResolvedValue({ id: 17, openId: "staff:17", name: "Staff Member", email: "staff@example.com", loginMethod: "local", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now });
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue({ userId: 17, jobTitle: "Technical Staff", isActive: true, preferredLanguage: "en", permissions: "{}", createdAt: now, updatedAt: now });
    vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue(stored);
    const upsert = vi.spyOn(db, "upsertStaffSmtpSettings").mockResolvedValue({ ...stored, fromName: "Managed Sender" });
    const result = await appRouter.createCaller(context("admin", SYSTEM_ADMIN_ACTOR_ID)).emailSettings.save({ ...input, userId: 17, fromName: "Managed Sender" });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ userId: 17, smtpPassword: stored.smtpPassword, fromName: "Managed Sender" }));
    expect(result).toMatchObject({ mode: "manage", userId: 17, ownerName: "Staff Member", fromName: "Managed Sender" });
    expect("smtpPassword" in result).toBe(false);
  });

  it("returns only read-only email and status fields to technical staff", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue({ userId: 17, jobTitle: "Technical Staff", isActive: true, preferredLanguage: "en", permissions: "{}", createdAt: new Date(), updatedAt: new Date() });
    vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue(stored);
    const result = await appRouter.createCaller(context("user", 17)).emailSettings.get();
    expect(result).toMatchObject({ mode: "readonly", userId: 17, fromEmail: "staff@example.com", isEnabled: true, configured: true });
    expect("smtpHost" in result).toBe(false);
    expect("smtpUsername" in result).toBe(false);
    expect("smtpPassword" in result).toBe(false);
  });

  it("rejects SMTP edits from technical staff", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue({ userId: 17, jobTitle: "Technical Staff", isActive: true, preferredLanguage: "en", permissions: "{}", createdAt: new Date(), updatedAt: new Date() });
    const caller = appRouter.createCaller(context("user", 17));
    await expect(caller.emailSettings.save({ ...input, smtpPassword: "new-secret" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns password presence without ever returning the stored password", () => {
    const result = publicStaffSmtpSettings(stored, stored.fromEmail);
    expect(result.hasPassword).toBe(true);
    expect(result.configured).toBe(true);
    expect("smtpPassword" in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain(stored.smtpPassword);
  });

  it("uses safe empty defaults without a password field", () => {
    const result = publicStaffSmtpSettings(undefined, "newstaff@example.com");
    expect(result).toMatchObject({ smtpUsername: "newstaff@example.com", fromEmail: "newstaff@example.com", hasPassword: false, configured: false });
    expect("smtpPassword" in result).toBe(false);
  });

  it("preserves the stored plaintext password when Super Admin submits a blank password", () => {
    const merged = mergeStaffSmtpSettings({ ...input, smtpPassword: "" }, stored, "Fallback Name");
    expect(merged.smtpPassword).toBe(stored.smtpPassword);
  });

  it("replaces the stored password only when Super Admin submits a new password", () => {
    const merged = mergeStaffSmtpSettings({ ...input, smtpPassword: "replacement-secret" }, stored, "Fallback Name");
    expect(merged.smtpPassword).toBe("replacement-secret");
  });
});
