import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
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

describe("staff SMTP settings API shaping", () => {
  it("rejects Super Admin access to the technical staff SMTP endpoint", async () => {
    const now = new Date();
    const caller = appRouter.createCaller({
      user: { id: -1, openId: "system:super-admin", name: "Super Administrator", email: "admin@admin.com", loginMethod: "local", role: "admin", createdAt: now, updatedAt: now, lastSignedIn: now },
      req: { headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });
    await expect(caller.emailSettings.get()).rejects.toMatchObject({ code: "FORBIDDEN" });
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

  it("preserves the stored plaintext password when the UI submits a blank password", () => {
    const merged = mergeStaffSmtpSettings({ ...input, smtpPassword: "" }, stored, "Fallback Name");
    expect(merged.smtpPassword).toBe(stored.smtpPassword);
  });

  it("replaces the stored password only when a new password is submitted", () => {
    const merged = mergeStaffSmtpSettings({ ...input, smtpPassword: "replacement-secret" }, stored, "Fallback Name");
    expect(merged.smtpPassword).toBe("replacement-secret");
  });
});
