import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { SYSTEM_ADMIN_ACTOR_ID } from "../shared/const";
import * as db from "./db";
import { appRouter } from "./routers";
import * as smtp from "./smtp";

const now = new Date("2026-09-13T00:00:00Z");
const staff = { id: 17, openId: "staff:17", name: "Staff Member", email: "staff@example.com", loginMethod: "local", role: "user" as const, createdAt: now, updatedAt: now, lastSignedIn: now };
const admin = { id: SYSTEM_ADMIN_ACTOR_ID, openId: "system:admin", name: "Super Administrator", email: "admin@admin.com", loginMethod: "local", role: "admin" as const, createdAt: now, updatedAt: now, lastSignedIn: now };
const permissions = { userId: 17, jobTitle: "Technical Staff", isActive: true, preferredLanguage: "en" as const, permissions: JSON.stringify({ viewLeads: true, createLeads: true, editLeads: true, scanDocuments: false, viewClinical: false, manageContacts: true, changeStatus: true, exportData: false }), createdAt: now, updatedAt: now };
const smtpSettings = { userId: 17, smtpHost: "smtp.example.com", smtpPort: 587, smtpSecurity: "starttls" as const, smtpUsername: "staff@example.com", smtpPassword: "secret", fromEmail: "staff@example.com", fromName: "Staff Member", replyToEmail: null, isEnabled: true, verifiedAt: Date.now(), lastTestedAt: Date.now(), lastTestError: null, createdAt: now, updatedAt: now };

function context(user: TrpcContext["user"] = staff): TrpcContext {
  return { user, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

afterEach(() => vi.restoreAllMocks());

describe("manual lead email", () => {
  it("keeps global header and footer management exclusive to Super Admin", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    const getTemplate = vi.spyOn(db, "getEmailTemplate");
    const saveTemplate = vi.spyOn(db, "upsertEmailTemplate");

    await expect(appRouter.createCaller(context()).mail.template()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context()).mail.saveTemplate({ headerHtml: "<p>Header</p>", footerHtml: "<p>Footer</p>" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getTemplate).not.toHaveBeenCalled();
    expect(saveTemplate).not.toHaveBeenCalled();

    getTemplate.mockResolvedValue(undefined);
    saveTemplate.mockResolvedValue(undefined);
    await appRouter.createCaller(context(admin)).mail.saveTemplate({ headerHtml: "<p>Global header</p>", footerHtml: "<p>Global footer</p>" });
    expect(saveTemplate).toHaveBeenCalledWith(expect.objectContaining({ userId: SYSTEM_ADMIN_ACTOR_ID, updatedBy: SYSTEM_ADMIN_ACTOR_ID }));
  });

  it("sends through the logged-in staff SMTP account and records history and communication", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    vi.spyOn(db, "getEmailRecipient").mockResolvedValue({ id: 42, firstName: "Ana", lastName: "Rivera", email: "ana@example.com" });
    vi.spyOn(db, "getSelectableEmailMessageTemplate").mockResolvedValue({ id: 8, productId: 3, productName: "Recovery Mat", productIsActive: true, name: "Initial introduction", description: null, subject: "Hello {{leadFirstName}}", contentMode: "plain", bodyText: "Your update is ready.", bodyHtml: null, sourceFileName: null, isActive: true, sortOrder: 0, createdBy: 1, updatedBy: 1, createdAt: now, updatedAt: now });
    vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue(smtpSettings);
    const getFrame = vi.spyOn(db, "getEmailTemplate").mockResolvedValue({ userId: SYSTEM_ADMIN_ACTOR_ID, headerHtml: "<p>Hello {{leadFirstName}}</p><script>bad()</script>", footerHtml: "<p>{{senderName}}</p>", updatedBy: SYSTEM_ADMIN_ACTOR_ID, createdAt: now, updatedAt: now });
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail").mockResolvedValue({ configured: true, sent: true, error: null, messageId: "message-1" });
    const addHistory = vi.spyOn(db, "addOutboundEmail").mockResolvedValue(9);
    const addCommunication = vi.spyOn(db, "addCommunicationWithAudit").mockResolvedValue({ communicationId: 7, lead: {} as never });

    const result = await appRouter.createCaller(context()).mail.send({ leadId: 42, messageTemplateId: 8, subject: "Hello {{leadFirstName}}", bodyText: "Your update is ready." });

    expect(result.success).toBe(true);
    expect(getFrame).toHaveBeenCalledWith(SYSTEM_ADMIN_ACTOR_ID);
    expect(send).toHaveBeenCalledWith(smtpSettings, expect.objectContaining({ to: "ana@example.com", subject: "Hello Ana", html: expect.not.stringContaining("<script>") }));
    expect(addHistory).toHaveBeenCalledWith(expect.objectContaining({ senderUserId: 17, leadId: 42, productId: 3, messageTemplateId: 8, productName: "Recovery Mat", templateName: "Initial introduction", status: "sent", providerMessageId: "message-1" }));
    expect(addCommunication).toHaveBeenCalledWith(expect.objectContaining({ leadId: 42, method: "email", direction: "outbound", createdBy: 17 }));
  });

  it("sanitizes and sends an edited HTML template with a plain-text alternative", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    vi.spyOn(db, "getEmailRecipient").mockResolvedValue({ id: 42, firstName: "Ana", lastName: "Rivera", email: "ana@example.com" });
    vi.spyOn(db, "getSelectableEmailMessageTemplate").mockResolvedValue({ id: 18, productId: 3, productName: "Recovery Mat", productIsActive: true, name: "Designed update", description: null, subject: "Update for {{leadFirstName}}", contentMode: "html", bodyText: "Hello {{leadFirstName}}", bodyHtml: "<h1>Hello {{leadFirstName}}</h1>", sourceFileName: "update.html", isActive: true, sortOrder: 0, createdBy: 1, updatedBy: 1, createdAt: now, updatedAt: now });
    vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue(smtpSettings);
    vi.spyOn(db, "getEmailTemplate").mockResolvedValue(undefined);
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail").mockResolvedValue({ configured: true, sent: true, error: null, messageId: "html-message" });
    vi.spyOn(db, "addOutboundEmail").mockResolvedValue(19);
    const addCommunication = vi.spyOn(db, "addCommunicationWithAudit").mockResolvedValue({ communicationId: 20, lead: {} as never });

    await appRouter.createCaller(context()).mail.send({
      leadId: 42,
      messageTemplateId: 18,
      subject: "Update for {{leadFirstName}}",
      contentMode: "html",
      bodyText: "",
      bodyHtml: '<table onclick="bad()"><tr><td>Hello {{leadFirstName}}<script>bad()</script></td></tr></table>',
    });

    const message = send.mock.calls[0]?.[1];
    expect(message?.subject).toBe("Update for Ana");
    expect(message?.html).toContain("Hello Ana");
    expect(message?.html).not.toContain("script");
    expect(message?.html).not.toContain("onclick");
    expect(message?.text).toContain("Hello Ana");
    expect(addCommunication).toHaveBeenCalledWith(expect.objectContaining({ notes: "Hello {{leadFirstName}}" }));
  });

  it("blocks sending until the assigned SMTP account is enabled and verified", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    vi.spyOn(db, "getEmailRecipient").mockResolvedValue({ id: 42, firstName: "Ana", lastName: "Rivera", email: "ana@example.com" });
    vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue({ ...smtpSettings, verifiedAt: null });
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail");

    await expect(appRouter.createCaller(context()).mail.send({ leadId: 42, subject: "Hello", bodyText: "Message" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(send).not.toHaveBeenCalled();
  });

  it("blocks a stale or archived template selection before SMTP delivery", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    vi.spyOn(db, "getEmailRecipient").mockResolvedValue({ id: 42, firstName: "Ana", lastName: "Rivera", email: "ana@example.com" });
    vi.spyOn(db, "getSelectableEmailMessageTemplate").mockResolvedValue(undefined);
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail");

    await expect(appRouter.createCaller(context()).mail.send({ leadId: 42, messageTemplateId: 99, subject: "Hello", bodyText: "Message" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(send).not.toHaveBeenCalled();
  });

  it("blocks arbitrary HTML when no approved HTML template is selected", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    vi.spyOn(db, "getEmailRecipient").mockResolvedValue({ id: 42, firstName: "Ana", lastName: "Rivera", email: "ana@example.com" });
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail");

    await expect(appRouter.createCaller(context()).mail.send({ leadId: 42, subject: "Hello", contentMode: "html", bodyText: "", bodyHtml: "<p>HTML</p>" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(send).not.toHaveBeenCalled();
  });

  it("records failed delivery without adding a successful lead communication", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    vi.spyOn(db, "getEmailRecipient").mockResolvedValue({ id: 42, firstName: "Ana", lastName: "Rivera", email: "ana@example.com" });
    vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue(smtpSettings);
    vi.spyOn(db, "getEmailTemplate").mockResolvedValue(undefined);
    vi.spyOn(smtp, "sendStaffSmtpEmail").mockResolvedValue({ configured: true, sent: false, error: "Mailbox rejected the request." });
    const addHistory = vi.spyOn(db, "addOutboundEmail").mockResolvedValue(10);
    const addCommunication = vi.spyOn(db, "addCommunicationWithAudit");

    await expect(appRouter.createCaller(context()).mail.send({ leadId: 42, subject: "Hello", bodyText: "Message" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(addHistory).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", error: "Mailbox rejected the request." }));
    expect(addCommunication).not.toHaveBeenCalled();
  });

  it("enforces lead visibility before reading or sending to a recipient", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    vi.spyOn(db, "getEmailRecipient").mockResolvedValue(undefined);
    await expect(appRouter.createCaller(context()).mail.send({ leadId: 999, subject: "Hello", bodyText: "Message" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("shows one lead's email history across all staff senders to every authorized lead viewer", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue({ ...permissions, permissions: JSON.stringify({ viewLeads: true, manageContacts: false }) });
    vi.spyOn(db, "canAccessLead").mockResolvedValue(true);
    vi.spyOn(db, "listLeadOutboundEmails").mockResolvedValue({
      total: 2,
      sentCount: 1,
      failedCount: 1,
      messages: [
        { id: 91, leadId: 42, senderUserId: 18, recipientEmail: "ana@example.com", recipientName: "Ana Rivera", fromEmail: "other@example.com", productName: "Recovery Mat", templateName: "Introduction", subject: "Hello", status: "sent", error: null, sentAt: 1_800_000, senderName: "Other Staff" },
        { id: 90, leadId: 42, senderUserId: 17, recipientEmail: "ana@example.com", recipientName: "Ana Rivera", fromEmail: "staff@example.com", productName: null, templateName: null, subject: "Follow-up", status: "failed", error: "Private SMTP diagnostic", sentAt: 1_700_000, senderName: "Staff Member" },
      ],
    });

    const history = await appRouter.createCaller(context()).mail.leadHistory({ leadId: 42 });

    expect(history.sentCount).toBe(1);
    expect(history.messages.map(message => message.senderName)).toEqual(["Other Staff", "Staff Member"]);
    expect(history.messages[1]?.error).toBe("Delivery failed. Ask Super Admin to review the sender SMTP account.");
  });

  it("blocks lead email history when the viewer cannot access that lead", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    vi.spyOn(db, "canAccessLead").mockResolvedValue(false);
    const listHistory = vi.spyOn(db, "listLeadOutboundEmails");

    await expect(appRouter.createCaller(context()).mail.leadHistory({ leadId: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(listHistory).not.toHaveBeenCalled();
  });

  it("allows an authorized lead viewer to open an email sent by another staff member", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue({ ...permissions, permissions: JSON.stringify({ viewLeads: true, manageContacts: false }) });
    vi.spyOn(db, "canAccessLead").mockResolvedValue(true);
    vi.spyOn(db, "getLeadOutboundEmail").mockResolvedValue({
      id: 91,
      leadId: 42,
      senderUserId: 18,
      recipientEmail: "ana@example.com",
      recipientName: "Ana Rivera",
      fromEmail: "other@example.com",
      productId: 3,
      messageTemplateId: 8,
      productName: "Recovery Mat",
      templateName: "Introduction",
      subject: "Hello",
      bodyHtml: "<p>Hello Ana</p>",
      status: "sent",
      providerMessageId: "message-91",
      error: null,
      sentAt: 1_800_000,
      createdAt: now,
      senderName: "Other Staff",
    });

    const message = await appRouter.createCaller(context()).mail.leadMessage({ leadId: 42, id: 91 });

    expect(message.senderName).toBe("Other Staff");
    expect(message.bodyHtml).toContain("Hello Ana");
  });
});
