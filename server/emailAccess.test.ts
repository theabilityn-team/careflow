import { afterEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ADMIN_ACTOR_ID } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";
import * as smtp from "./smtp";

const now = new Date("2026-10-25T00:00:00Z");
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
const admin = {
  id: SYSTEM_ADMIN_ACTOR_ID,
  openId: "system:admin",
  name: "Super Administrator",
  email: "admin@admin.com",
  loginMethod: "local",
  role: "admin" as const,
  createdAt: now,
  updatedAt: now,
  lastSignedIn: now,
};

function context(user: typeof staff | typeof admin = staff): TrpcContext {
  return { user, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function permissionRecord(flags: Record<string, boolean>) {
  return {
    userId: staff.id,
    jobTitle: "Technical Staff",
    isActive: true,
    preferredLanguage: "en" as const,
    permissions: JSON.stringify(flags),
    createdAt: now,
    updatedAt: now,
  };
}

const smtpSettings = {
  userId: staff.id,
  smtpHost: "smtp.example.com",
  smtpPort: 587,
  smtpSecurity: "starttls" as const,
  smtpUsername: staff.email,
  smtpPassword: "secret",
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

const activeTemplate = {
  id: 8,
  productId: 3,
  productName: "Recovery Mat",
  productIsActive: true,
  name: "Initial introduction",
  description: null,
  subject: "Hello {{leadFirstName}}",
  contentMode: "plain" as const,
  bodyText: "Your update is ready.",
  bodyHtml: null,
  sourceFileName: null,
  isActive: true,
  sortOrder: 0,
  createdBy: 1,
  updatedBy: 1,
  createdAt: now,
  updatedAt: now,
};

const activeProduct = {
  id: 3,
  name: "Recovery Mat",
  description: null,
  isActive: true,
  sortOrder: 0,
  createdBy: 1,
  updatedBy: 1,
  createdAt: now,
  updatedAt: now,
};

const recipient = { id: 42, firstName: "Ana", lastName: "Rivera", email: "ana@example.com" };

function grant(flags: Record<string, boolean>) {
  vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissionRecord(flags));
}

function plainSendInput(overrides: Record<string, unknown> = {}) {
  return { leadId: recipient.id, subject: "Hello", bodyText: "Message", ...overrides };
}

afterEach(() => vi.restoreAllMocks());

describe("email access controls", () => {
  it("blocks manually logging email or completing follow-ups by email without Emails access", async () => {
    grant({ manageContacts: true, viewLeads: true, manageEmails: false });
    const log = vi.spyOn(db, "addCommunicationWithAudit");
    const input = { leadId: 42, method: "email" as const, direction: "outbound" as const, outcome: "External email", contactedAt: Date.now() };
    await expect(appRouter.createCaller(context()).leads.addCommunication(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context()).leads.addCommunication({ ...input, completeFollowUp: true, followUpId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(log).not.toHaveBeenCalled();
  });

  it("does not treat manageContacts as email access", async () => {
    grant({ manageContacts: true });
    const listRecipients = vi.spyOn(db, "listEmailRecipients");

    await expect(appRouter.createCaller(context()).mail.recipients({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context()).mail.history()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context()).mail.message({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(listRecipients).not.toHaveBeenCalled();
  });

  it("allows a mail-only staff member to send a plain manual email but not templates or HTML", async () => {
    grant({ manageEmails: true });
    vi.spyOn(db, "getEmailRecipient").mockResolvedValue(recipient);
    vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue(smtpSettings);
    vi.spyOn(db, "getEmailTemplate").mockResolvedValue(undefined);
    vi.spyOn(db, "addOutboundEmail").mockResolvedValue(9);
    vi.spyOn(db, "addCommunicationWithAudit").mockResolvedValue({ communicationId: 7, lead: {} as never });
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail").mockResolvedValue({ configured: true, sent: true, error: null, messageId: "message-1" });
    const getSelectable = vi.spyOn(db, "getSelectableEmailMessageTemplate");

    await expect(appRouter.createCaller(context()).mail.send(plainSendInput({ messageTemplateId: null }))).resolves.toMatchObject({ success: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(getSelectable).not.toHaveBeenCalled();

    await expect(appRouter.createCaller(context()).mail.send(plainSendInput({ messageTemplateId: 8 }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context()).mail.send(plainSendInput({ contentMode: "html", bodyText: "", bodyHtml: "<p>HTML</p>" }))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires both permissions for the approved template library and prevents template-only staff from mail history", async () => {
    grant({ useEmailTemplates: true });
    const listProducts = vi.spyOn(db, "listEmailProducts");
    const listHistory = vi.spyOn(db, "listOutboundEmails");

    await expect(appRouter.createCaller(context()).emailLibrary.library()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context()).mail.history()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(listProducts).not.toHaveBeenCalled();
    expect(listHistory).not.toHaveBeenCalled();
  });

  it("allows both permissions to read the active library and send an active selected template", async () => {
    grant({ manageEmails: true, useEmailTemplates: true });
    vi.spyOn(db, "listEmailProducts").mockResolvedValue([activeProduct]);
    vi.spyOn(db, "listEmailMessageTemplates").mockResolvedValue([activeTemplate]);
    const library = await appRouter.createCaller(context()).emailLibrary.library();
    expect(library[0]?.templates[0]).toMatchObject({ id: activeTemplate.id, name: activeTemplate.name });

    vi.spyOn(db, "getEmailRecipient").mockResolvedValue(recipient);
    vi.spyOn(db, "getSelectableEmailMessageTemplate").mockResolvedValue(activeTemplate);
    vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue(smtpSettings);
    vi.spyOn(db, "getEmailTemplate").mockResolvedValue(undefined);
    vi.spyOn(db, "addOutboundEmail").mockResolvedValue(9);
    vi.spyOn(db, "addCommunicationWithAudit").mockResolvedValue({ communicationId: 7, lead: {} as never });
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail").mockResolvedValue({ configured: true, sent: true, error: null, messageId: "message-1" });

    await expect(appRouter.createCaller(context()).mail.send(plainSendInput({ messageTemplateId: activeTemplate.id }))).resolves.toMatchObject({ success: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("rejects inactive or unavailable templates before SMTP delivery", async () => {
    grant({ manageEmails: true, useEmailTemplates: true });
    vi.spyOn(db, "getEmailRecipient").mockResolvedValue(recipient);
    vi.spyOn(db, "getSelectableEmailMessageTemplate").mockResolvedValue(undefined);
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail");

    await expect(appRouter.createCaller(context()).mail.send(plainSendInput({ messageTemplateId: 99 }))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps global frame and library CRUD Super Admin-only even when staff email flags are enabled", async () => {
    grant({ manageEmails: true, useEmailTemplates: true });
    const getFrame = vi.spyOn(db, "getEmailTemplate");
    const listProducts = vi.spyOn(db, "listEmailProducts");

    await expect(appRouter.createCaller(context()).mail.template()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context()).emailLibrary.adminList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context()).emailLibrary.createProduct({ name: "Blocked", description: null, isActive: true, sortOrder: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getFrame).not.toHaveBeenCalled();
    expect(listProducts).not.toHaveBeenCalled();

    getFrame.mockResolvedValue(undefined);
    await expect(appRouter.createCaller(context(admin)).mail.template()).resolves.toMatchObject({ headerHtml: expect.any(String), footerHtml: expect.any(String) });
  });

  it("keeps staff SMTP metadata available but guards connection and template test operations even with both email flags", async () => {
    grant({ manageEmails: true, useEmailTemplates: true });
    const getSettings = vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue(smtpSettings);
    const status = await appRouter.createCaller(context()).emailSettings.get();
    expect(status).toMatchObject({ mode: "readonly", userId: staff.id, accountEmail: staff.email, configured: true });
    expect(status).not.toHaveProperty("smtpPassword");

    const verify = vi.spyOn(smtp, "verifyStaffSmtp");
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail");
    const getUser = vi.spyOn(db, "getUserById");
    const listProducts = vi.spyOn(db, "listEmailProducts");
    const settingsCallsAfterStatus = getSettings.mock.calls.length;
    await expect(appRouter.createCaller(context()).emailSettings.testConnection()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context()).emailSettings.testEmailTemplates()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context()).emailSettings.sendTestEmail({ recipientEmail: "destination@example.com", messageTemplateId: 8 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(verify).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(getSettings).toHaveBeenCalledTimes(settingsCallsAfterStatus);
    expect(listProducts).not.toHaveBeenCalled();
  });

  it("requires both permissions for staff SMTP template tests", async () => {
    grant({ manageEmails: true });
    vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue(smtpSettings);
    const listProducts = vi.spyOn(db, "listEmailProducts");
    await expect(appRouter.createCaller(context()).emailSettings.testEmailTemplates()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context()).emailSettings.sendTestEmail({ recipientEmail: "destination@example.com", messageTemplateId: 8 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(listProducts).not.toHaveBeenCalled();
  });

  it("redacts email communication text and email audit values from leads.get without hiding phone activity", async () => {
    grant({ viewLeads: true });
    vi.spyOn(db, "getLead").mockResolvedValue({
      lead: { id: 42, diagnosis: null, clinicalNotes: null, additionalInformation: null } as never,
      documents: [],
      communications: [
        { id: 1, method: "email", outcome: "Email sent: private subject", notes: "Private email body" },
        { id: 2, method: "phone", outcome: "Left voicemail", notes: "Call notes remain visible" },
      ],
      followUps: [],
      auditEvents: [{
        id: 1,
        leadId: 42,
        actorId: staff.id,
        actorName: staff.name,
        actorEmail: staff.email,
        action: "communication.logged",
        source: "communication",
        detail: "email: Email sent: private subject",
        changes: JSON.stringify([{ field: "email", before: null, after: "Private email value" }, { field: "phone", before: null, after: "+1 555 0100" }]),
        snapshotBefore: JSON.stringify({ email: null, phone: null }),
        snapshotAfter: JSON.stringify({ email: "Private email value", phone: "+1 555 0100" }),
        occurredAt: Date.now(),
      }],
    } as never);

    const result = await appRouter.createCaller(context()).leads.get({ id: 42 });
    expect(result.communications[0]).toMatchObject({ method: "email", outcome: "Email communication", notes: null });
    expect(result.communications[1]).toMatchObject({ method: "phone", outcome: "Left voicemail", notes: "Call notes remain visible" });
    expect(JSON.stringify(result)).not.toContain("private subject");
    expect(JSON.stringify(result)).not.toContain("Private email value");
    expect(result.auditEvents[0]?.changes).toEqual([{ field: "phone", before: null, after: "+1 555 0100" }]);
    expect(result.auditEvents[0]?.snapshotAfter).toEqual({ phone: "+1 555 0100" });
  });

  it("redacts email text in completed follow-up archive without hiding phone notes", async () => {
    grant({ viewLeads: true });
    vi.spyOn(db, "getCompletedFollowUps").mockResolvedValue({
      total: 2,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      offset: 0,
      items: [
        { id: 1, leadId: 42, firstName: "Ana", lastName: "Rivera", stateCode: "FL", diagnosisCategory: "oncology", status: "contacted", scheduledFor: 1, completedAt: 2, method: "email", outcome: "Email sent: private subject", notes: "Private email body", nextFollowUpAt: null, completedBy: staff.id, completedByName: staff.name },
        { id: 2, leadId: 42, firstName: "Ana", lastName: "Rivera", stateCode: "FL", diagnosisCategory: "oncology", status: "contacted", scheduledFor: 3, completedAt: 4, method: "phone", outcome: "Left voicemail", notes: "Call notes remain visible", nextFollowUpAt: null, completedBy: staff.id, completedByName: staff.name },
      ],
    } as never);

    const result = await appRouter.createCaller(context()).dashboard.followUpArchive({ page: 1, pageSize: 20 });
    expect(result.items[0]).toMatchObject({ method: "email", outcome: "Email communication", notes: null });
    expect(result.items[1]).toMatchObject({ method: "phone", outcome: "Left voicemail", notes: "Call notes remain visible" });
    expect(JSON.stringify(result)).not.toContain("private subject");
    expect(JSON.stringify(result)).not.toContain("Private email body");
  });
});
