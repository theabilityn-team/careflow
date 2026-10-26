import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { SYSTEM_ADMIN_ACTOR_ID } from "../shared/const";
import * as db from "./db";
import { appRouter } from "./routers";
import * as smtp from "./smtp";

const now = new Date("2026-09-13T00:00:00Z");
const staff = { id: 17, openId: "staff:17", name: "Staff Member", email: "staff@example.com", loginMethod: "local", role: "user" as const, createdAt: now, updatedAt: now, lastSignedIn: now };
const permissions = { userId: 17, jobTitle: "Technical Staff", isActive: true, preferredLanguage: "en" as const, permissions: JSON.stringify({ manageEmails: true, useEmailTemplates: true, viewLeads: true }), createdAt: now, updatedAt: now };
const smtpSettings = { userId: 17, smtpHost: "smtp.example.com", smtpPort: 587, smtpSecurity: "starttls" as const, smtpUsername: "staff@example.com", smtpPassword: "secret", fromEmail: "staff@example.com", fromName: "Staff Member", replyToEmail: null, isEnabled: true, verifiedAt: Date.now(), lastTestedAt: Date.now(), lastTestError: null, createdAt: now, updatedAt: now };

function context(): TrpcContext {
  return { user: staff, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

afterEach(() => vi.restoreAllMocks());

describe("manual mail recipients", () => {
  it("sends directly without looking up or linking a lead, and renders safe direct-recipient tokens", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    const getRecipient = vi.spyOn(db, "getEmailRecipient");
    vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue(smtpSettings);
    vi.spyOn(db, "getEmailTemplate").mockResolvedValue(undefined);
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail").mockResolvedValue({ configured: true, sent: true, error: null, messageId: "direct-1" });
    const addHistory = vi.spyOn(db, "addOutboundEmail").mockResolvedValue(11);
    const addCommunication = vi.spyOn(db, "addCommunicationWithAudit");

    const result = await appRouter.createCaller(context()).mail.send({
      recipientEmail: "To@Example.com",
      recipientName: "Jane Doe",
      cc: ["TO@example.com", "Cc@Example.com"],
      bcc: ["cc@example.com", "Secret@example.com"],
      subject: "Hello {{leadFirstName}}",
      bodyText: "Hi {{leadFullName}}",
    });

    expect(result).toMatchObject({ success: true, communicationLogged: false, linkedToLead: false });
    expect(getRecipient).not.toHaveBeenCalled();
    expect(addCommunication).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(smtpSettings, expect.objectContaining({
      to: "to@example.com",
      cc: ["cc@example.com"],
      bcc: ["secret@example.com"],
      subject: "Hello Jane",
      text: expect.stringContaining("Hi Jane Doe"),
    }));
    expect(addHistory).toHaveBeenCalledWith(expect.objectContaining({
      leadId: null,
      recipientEmail: "to@example.com",
      ccEmails: JSON.stringify(["cc@example.com"]),
      bccEmails: JSON.stringify(["secret@example.com"]),
      recipientName: "Jane Doe",
    }));
  });

  it("uses 'there' for the direct greeting and rejects both/neither recipient sources before SMTP", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail");

    await expect(appRouter.createCaller(context()).mail.send({ subject: "Hello", bodyText: "Message" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(appRouter.createCaller(context()).mail.send({ leadId: 42, recipientEmail: "person@example.com", subject: "Hello", bodyText: "Message" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects raw leading/trailing line breaks before any delivery", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail");
    for (const recipientEmail of ["person@example.com\r\n", "\nperson@example.com"]) {
      await expect(appRouter.createCaller(context()).mail.send({ recipientEmail, subject: "Subject", bodyText: "Body" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps BCC private in global and lead histories/details while sender and Super Admin retain it", async () => {
    const permissionLookup = vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    vi.spyOn(db, "canAccessLead").mockResolvedValue(true);
    const record = { id: 99, senderUserId: 17, senderName: "Staff Member", leadId: 42, recipientEmail: "to@example.com", recipientName: "Recipient", fromEmail: "staff@example.com", productId: null, messageTemplateId: null, productName: null, templateName: null, subject: "Subject", bodyHtml: "<p>Body</p>", status: "sent" as const, providerMessageId: null, error: null, trackingToken: "private-token", trackingEnabled: true, firstOpenedAt: null, lastOpenedAt: null, openCount: 0, firstClickedAt: null, lastClickedAt: null, clickCount: 0, sentAt: 123, createdAt: now, ccEmails: ["copy@example.com"], bccEmails: ["private@example.com"] };
    vi.spyOn(db, "listOutboundEmails").mockResolvedValue([record]);
    vi.spyOn(db, "getOutboundEmail").mockResolvedValue(record);
    vi.spyOn(db, "listLeadOutboundEmails").mockResolvedValue({ total: 1, sentCount: 1, failedCount: 0, openedCount: 0, clickedCount: 0, messages: [record] });
    vi.spyOn(db, "getLeadOutboundEmail").mockResolvedValue(record);
    const own = appRouter.createCaller(context());
    expect((await own.mail.message({ id: 99 })).bccEmails).toEqual(["private@example.com"]);
    permissionLookup.mockResolvedValue({ ...permissions, userId: 18, permissions: JSON.stringify({ viewLeads: true, manageEmails: true, manageSales: true }) });
    const other = appRouter.createCaller({ ...context(), user: { ...staff, id: 18 } });
    const restricted = [await other.mail.history(), await other.mail.message({ id: 99 }), await other.mail.leadHistory({ leadId: 42 }), await other.mail.leadMessage({ leadId: 42, id: 99 })];
    expect(JSON.stringify(restricted)).not.toContain("private@example.com");
    expect(JSON.stringify(restricted)).toContain("copy@example.com");
    const admin = appRouter.createCaller({ ...context(), user: { ...staff, id: SYSTEM_ADMIN_ACTOR_ID, role: "admin" } });
    expect((await admin.mail.message({ id: 99 })).bccEmails).toEqual(["private@example.com"]);
    expect(await admin.mail.message({ id: 99 })).not.toHaveProperty("trackingToken");
  });

});
