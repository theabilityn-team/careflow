import { describe, expect, it } from "vitest";
import { canManageEmailSettings } from "../client/src/lib/emailSettingsAccess";

describe("SMTP setup screen access", () => {
  it("allows only the Super Admin role", () => {
    expect(canManageEmailSettings("super_admin")).toBe(true);
    expect(canManageEmailSettings("technical_staff")).toBe(false);
  });

  it("fails closed while access is loading or unavailable", () => {
    for (const role of [undefined, null, "", "admin", "user", "unknown"]) {
      expect(canManageEmailSettings(role)).toBe(false);
    }
  });

  it("does not turn email-sending permissions into SMTP setup access", () => {
    for (const manageEmails of [true, false]) for (const useEmailTemplates of [true, false]) {
      const access = { role: "technical_staff", permissions: { manageEmails, useEmailTemplates } };
      expect(canManageEmailSettings(access.role)).toBe(false);
    }
  });
});
