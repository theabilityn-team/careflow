import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";
import * as smtp from "./smtp";

const now = new Date("2026-09-13T00:00:00Z");
const staff = { id: 17, openId: "staff:17", name: "Staff Member", email: "staff@example.com", loginMethod: "local", role: "user" as const, createdAt: now, updatedAt: now, lastSignedIn: now };
const permissions = { userId: 17, jobTitle: "Technical Staff", isActive: true, preferredLanguage: "en" as const, permissions: JSON.stringify({ viewLeads: true, createLeads: true, editLeads: true, scanDocuments: false, viewClinical: false, manageContacts: true, changeStatus: true, exportData: false }), createdAt: now, updatedAt: now };
const smtpSettings = { userId: 17, smtpHost: "smtp.example.com", smtpPort: 587, smtpSecurity: "starttls" as const, smtpUsername: "staff@example.com", smtpPassword: "secret", fromEmail: "staff@example.com", fromName: "Staff Member", replyToEmail: null, isEnabled: true, verifiedAt: Date.now(), lastTestedAt: Date.now(), lastTestError: null, createdAt: now, updatedAt: now };

function context(): TrpcContext {
  return { user: staff, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

afterEach(() => vi.restoreAllMocks());

describe("manual lead email", () => {
  it("sends through the logged-in staff SMTP account and records history and communication", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    vi.spyOn(db, "getEmailRecipient").mockResolvedValue({ id: 42, firstName: "Ana", lastName: "Rivera", email: "ana@example.com" });
    vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue(smtpSettings);
    vi.spyOn(db, "getEmailTemplate").mockResolvedValue({ userId: 17, headerHtml: "<p>Hello {{leadFirstName}}</p><script>bad()</script>", footerHtml: "<p>{{senderName}}</p>", updatedBy: 17, createdAt: now, updatedAt: now });
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail").mockResolvedValue({ configured: true, sent: true, error: null, messageId: "message-1" });
    const addHistory = vi.spyOn(db, "addOutboundEmail").mockResolvedValue(9);
    const addCommunication = vi.spyOn(db, "addCommunicationWithAudit").mockResolvedValue({ communicationId: 7, lead: {} as never });

    const result = await appRouter.createCaller(context()).mail.send({ leadId: 42, subject: "Hello {{leadFirstName}}", bodyText: "Your update is ready." });

    expect(result.success).toBe(true);
    expect(send).toHaveBeenCalledWith(smtpSettings, expect.objectContaining({ to: "ana@example.com", subject: "Hello Ana", html: expect.not.stringContaining("<script>") }));
    expect(addHistory).toHaveBeenCalledWith(expect.objectContaining({ senderUserId: 17, leadId: 42, status: "sent", providerMessageId: "message-1" }));
    expect(addCommunication).toHaveBeenCalledWith(expect.objectContaining({ leadId: 42, method: "email", direction: "outbound", createdBy: 17 }));
  });

  it("blocks sending until the assigned SMTP account is enabled and verified", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    vi.spyOn(db, "getEmailRecipient").mockResolvedValue({ id: 42, firstName: "Ana", lastName: "Rivera", email: "ana@example.com" });
    vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue({ ...smtpSettings, verifiedAt: null });
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail");

    await expect(appRouter.createCaller(context()).mail.send({ leadId: 42, subject: "Hello", bodyText: "Message" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
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
});
