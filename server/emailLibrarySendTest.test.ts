import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";
import * as smtp from "./smtp";

const now = new Date("2026-10-29T00:00:00Z");
const staff = {
  id: 17,
  openId: "staff:17",
  name: "Staff Member",
  email: "staff@example.com",
  loginMethod: "local",
  role: "user" as const,
  createdAt: now,
  updatedAt: now,
  lastSignedIn: now,
};
const leader = { ...staff, openId: "staff:leader" };
const smtpSettings = {
  userId: staff.id,
  smtpHost: "smtp.example.com",
  smtpPort: 587,
  smtpSecurity: "starttls" as const,
  smtpUsername: staff.email,
  smtpPassword: "smtp-secret",
  fromEmail: staff.email,
  fromName: staff.name,
  replyToEmail: null,
  isEnabled: true,
  verifiedAt: Date.now(),
  lastTestedAt: Date.now(),
  lastTestError: null,
  createdAt: now,
  updatedAt: now,
};
const defaultTemplate = {
  id: 8,
  ownerUserId: 30_001,
  productId: 3,
  productName: "Recovery Mat",
  productIsActive: true,
  name: "Default welcome",
  description: null,
  subject: "Hello {{leadFirstName}} from {{senderName}}",
  contentMode: "plain" as const,
  bodyText: "Welcome {{leadFullName}}.",
  bodyHtml: null,
  sourceFileName: null,
  isActive: true,
  sortOrder: 0,
  createdBy: 30_001,
  updatedBy: 30_001,
  createdAt: now,
  updatedAt: now,
};
const ownTemplate = {
  ...defaultTemplate,
  id: 9,
  ownerUserId: staff.id,
  name: "My welcome",
  subject: "Personal hello {{leadFirstName}}",
  bodyText: "Personal message for {{leadFullName}}.",
};

function context(user: typeof staff = staff): TrpcContext {
  return { user, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function grant(flags: Record<string, boolean>, isActive = true) {
  vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue({
    userId: staff.id,
    jobTitle: "Technical Staff",
    isActive,
    preferredLanguage: "en",
    permissions: JSON.stringify(flags),
    createdAt: now,
    updatedAt: now,
  });
}

function baseSetup() {
  grant({ manageEmails: true, useEmailTemplates: true });
  vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue(smtpSettings);
  vi.spyOn(db, "getEmailTemplate").mockResolvedValue(undefined);
}

const input = { recipientEmail: "destination@example.com", messageTemplateId: 8 };

afterEach(() => vi.restoreAllMocks());

describe("emailLibrary.sendTestEmail", () => {
  it("sends a test using the active default template through the caller's SMTP account", async () => {
    baseSetup();
    const getTemplate = vi.spyOn(db, "getSelectableEmailMessageTemplate").mockResolvedValue(defaultTemplate);
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail").mockResolvedValue({ configured: true, sent: true, error: null, messageId: "test-default" });

    const result = await appRouter.createCaller(context()).emailLibrary.sendTestEmail(input);

    expect(result).toMatchObject({ success: true, status: "sent", recipientEmail: input.recipientEmail, templateName: defaultTemplate.name, fromEmail: smtpSettings.fromEmail, fromName: smtpSettings.fromName });
    expect(getTemplate).toHaveBeenCalledWith(defaultTemplate.id, { userId: staff.id, isSuperAdmin: false });
    expect(send).toHaveBeenCalledWith(smtpSettings, expect.objectContaining({ to: input.recipientEmail, subject: "Hello Test from Staff Member", text: expect.stringContaining("Welcome Test Recipient.") }));
  });

  it("sends a test using the active personal template and keeps the effective SMTP owner on the session user", async () => {
    baseSetup();
    const getTemplate = vi.spyOn(db, "getSelectableEmailMessageTemplate").mockResolvedValue(ownTemplate);
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail").mockResolvedValue({ configured: true, sent: true, error: null, messageId: "test-own" });

    const result = await appRouter.createCaller(context()).emailLibrary.sendTestEmail({ ...input, messageTemplateId: ownTemplate.id });

    expect(result).toMatchObject({ success: true, templateName: ownTemplate.name });
    expect(getTemplate).toHaveBeenCalledWith(ownTemplate.id, { userId: staff.id, isSuperAdmin: false });
    expect(send).toHaveBeenCalledWith(smtpSettings, expect.objectContaining({ subject: "Personal hello Test" }));
    expect(send.mock.calls[0]?.[0]).toBe(smtpSettings);
  });

  it("denies a foreign personal template for ordinary staff and Leaders while retaining default-or-own scope", async () => {
    baseSetup();
    const getTemplate = vi.spyOn(db, "getSelectableEmailMessageTemplate").mockResolvedValue(undefined);
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail");

    await expect(appRouter.createCaller(context()).emailLibrary.sendTestEmail(input)).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Select an active email template." });
    await expect(appRouter.createCaller(context(leader)).emailLibrary.sendTestEmail(input)).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Select an active email template." });
    expect(getTemplate).toHaveBeenCalledWith(defaultTemplate.id, { userId: staff.id, isSuperAdmin: false });
    expect(send).not.toHaveBeenCalled();
  });

  it("requires both email permissions and an active staff account before SMTP", async () => {
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail");
    grant({ manageEmails: true });
    await expect(appRouter.createCaller(context()).emailLibrary.sendTestEmail(input)).rejects.toMatchObject({ code: "FORBIDDEN" });

    vi.restoreAllMocks();
    grant({ useEmailTemplates: true });
    await expect(appRouter.createCaller(context()).emailLibrary.sendTestEmail(input)).rejects.toMatchObject({ code: "FORBIDDEN" });

    vi.restoreAllMocks();
    grant({ manageEmails: true, useEmailTemplates: true }, false);
    await expect(appRouter.createCaller(context()).emailLibrary.sendTestEmail(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(send).not.toHaveBeenCalled();
  });

  it("requires an enabled, configured, verified caller SMTP account", async () => {
    grant({ manageEmails: true, useEmailTemplates: true });
    const getSettings = vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue({ ...smtpSettings, verifiedAt: null });
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail");

    await expect(appRouter.createCaller(context()).emailLibrary.sendTestEmail(input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(getSettings).toHaveBeenCalledWith(staff.id);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects CRLF recipients and sender spoof fields before any delivery", async () => {
    baseSetup();
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail");

    await expect(appRouter.createCaller(context()).emailLibrary.sendTestEmail({ ...input, recipientEmail: "destination@example.com\r\nBcc:evil@example.com" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(appRouter.createCaller(context()).emailLibrary.sendTestEmail({ ...input, senderEmail: "attacker@example.com" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(send).not.toHaveBeenCalled();
  });

  it("sanitizes HTML templates and the global frame while rendering test recipient and sender tokens", async () => {
    baseSetup();
    const htmlTemplate = {
      ...defaultTemplate,
      id: 18,
      name: "Designed welcome",
      subject: "Hi {{leadFullName}} from {{senderEmail}}",
      contentMode: "html" as const,
      bodyText: "stale fallback",
      bodyHtml: '<div onclick="bad()"><h1>Hello {{leadFirstName}}</h1><script>steal()</script><p>{{senderEmail}}</p></div>',
    };
    vi.spyOn(db, "getSelectableEmailMessageTemplate").mockResolvedValue(htmlTemplate);
    vi.spyOn(db, "getEmailTemplate").mockResolvedValue({
      userId: 30_001,
      headerHtml: '<header onclick="bad()">Header {{leadFirstName}}<script>bad()</script></header>',
      footerHtml: "<footer>{{senderName}}</footer>",
      updatedBy: 30_001,
      createdAt: now,
      updatedAt: now,
    });
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail").mockResolvedValue({ configured: true, sent: true, error: null, messageId: "test-html" });

    await appRouter.createCaller(context()).emailLibrary.sendTestEmail({ ...input, messageTemplateId: htmlTemplate.id });

    const message = send.mock.calls[0]?.[1];
    expect(message?.subject).toBe("Hi Test Recipient from staff@example.com");
    expect(message?.html).toContain("Header Test");
    expect(message?.html).toContain("Hello Test");
    expect(message?.html).toContain("staff@example.com");
    expect(message?.html).toContain("Staff Member");
    expect(message?.html).not.toContain("script");
    expect(message?.html).not.toContain("onclick");
    expect(message?.text).toContain("Hello Test");
  });

  it("returns a generic safe error for failed or thrown SMTP delivery", async () => {
    baseSetup();
    vi.spyOn(db, "getSelectableEmailMessageTemplate").mockResolvedValue(defaultTemplate);
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail").mockResolvedValue({ configured: true, sent: false, error: "private SMTP password and SQL details" });

    await expect(appRouter.createCaller(context()).emailLibrary.sendTestEmail(input)).rejects.toMatchObject({ code: "BAD_REQUEST", message: "The test email could not be sent. Ask Super Admin to review the sender SMTP account." });

    send.mockRejectedValueOnce(new Error("private SMTP password and SQL details"));
    await expect(appRouter.createCaller(context()).emailLibrary.sendTestEmail(input)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Unable to send the test email. Please try again." });
  });
});
