import { describe, expect, it } from "vitest";
import { isSmtpConfigured, safeSmtpError, smtpTransportOptions, type StaffSmtpConfig } from "./smtp";

const settings: StaffSmtpConfig = {
  smtpHost: " smtp.example.com ",
  smtpPort: 587,
  smtpSecurity: "starttls",
  smtpUsername: " staff@example.com ",
  smtpPassword: "top-secret-password",
  fromEmail: "staff@example.com",
  fromName: "CareFlow Staff",
  replyToEmail: null,
  isEnabled: true,
};

describe("staff SMTP utilities", () => {
  it("requires an enabled and complete staff SMTP account", () => {
    expect(isSmtpConfigured(settings)).toBe(true);
    expect(isSmtpConfigured({ ...settings, isEnabled: false })).toBe(false);
    expect(isSmtpConfigured({ ...settings, smtpPassword: "" })).toBe(false);
    expect(isSmtpConfigured({ ...settings, fromEmail: "" })).toBe(false);
  });

  it("maps TLS, STARTTLS, and unencrypted connection modes correctly", () => {
    expect(smtpTransportOptions({ ...settings, smtpSecurity: "tls", smtpPort: 465 })).toMatchObject({ secure: true, requireTLS: false, port: 465 });
    expect(smtpTransportOptions(settings)).toMatchObject({ secure: false, requireTLS: true, port: 587, host: "smtp.example.com", auth: { user: "staff@example.com", pass: "top-secret-password" } });
    expect(smtpTransportOptions({ ...settings, smtpSecurity: "none", smtpPort: 25 })).toMatchObject({ secure: false, requireTLS: false, port: 25 });
  });

  it("redacts every password occurrence from returned SMTP errors", () => {
    const error = safeSmtpError(new Error("Login top-secret-password failed: top-secret-password"), settings.smtpPassword);
    expect(error).toBe("Login [redacted] failed: [redacted]");
    expect(error).not.toContain(settings.smtpPassword);
  });
});
