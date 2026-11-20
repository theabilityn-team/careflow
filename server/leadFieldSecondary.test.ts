import { afterEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ADMIN_ACTOR_ID } from "../shared/const";
import { normalizeLeadFields } from "../shared/leadFieldPermissions";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import * as db from "./db";
import * as permissions from "./permissions";
import * as salesDb from "./salesDb";
import * as scannerExtraction from "./scannerExtraction";
import * as smtp from "./smtp";
import { redactRelatedLead } from "./leadFieldRelatedAccess";
import { processDueFollowUpReminders } from "./followUpReminders";

const now = new Date("2026-11-20T00:00:00Z");
const staff = {
  id: 17,
  openId: "staff:17",
  name: "Test Staff",
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
  loginMethod: "system",
  role: "admin" as const,
  createdAt: now,
  updatedAt: now,
  lastSignedIn: now,
};

function context(user: typeof staff | typeof admin = staff): TrpcContext {
  return { user, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function permissionRecord(flags: Record<string, boolean>, leadFields?: unknown) {
  return {
    userId: staff.id,
    jobTitle: "Technical Staff",
    isActive: true,
    preferredLanguage: "en" as const,
    permissions: JSON.stringify({ ...flags, ...(leadFields === undefined ? {} : { leadFields }) }),
    createdAt: now,
    updatedAt: now,
  };
}

const allFields = normalizeLeadFields(undefined);
const restrictedFields = { ...allFields, firstName: "hide" as const, lastName: "hide" as const, email: "hide" as const, diagnosis: "hide" as const, clinicalNotes: "hide" as const, status: "hide" as const };

afterEach(() => vi.restoreAllMocks());

describe("secondary lead-field security boundaries", () => {
  it("masks aliases, nested linked leads, flattened sales rows, and free text without mutating the source", () => {
    const source = {
      status: "paid",
      leadStatus: "customer",
      customerName: "PRIVATE_CUSTOMER_NAME",
      leadFirstName: "PRIVATE_FIRST",
      leadLastName: "PRIVATE_LAST",
      leadEmail: "PRIVATE_EMAIL",
      notes: "PRIVATE_ORDER_NOTE",
      lead: {
        firstName: "PRIVATE_NESTED_FIRST",
        lastName: "PRIVATE_NESTED_LAST",
        email: "PRIVATE_NESTED_EMAIL",
        diagnosis: "PRIVATE_DIAGNOSIS",
        status: "qualified",
      },
      auditEvents: [{
        actorName: "Visible Actor",
        snapshotBefore: JSON.stringify({ orderId: 4, status: "pending", email: "PRIVATE_BEFORE_EMAIL", lead: { firstName: "PRIVATE_BEFORE_NAME" } }),
        snapshotAfter: { orderId: 4, status: "paid", notes: "PRIVATE_AFTER_NOTE", lead: { lastName: "PRIVATE_AFTER_LAST" } },
      }],
    };
    const safe = redactRelatedLead(source, {
      role: "technical_staff",
      isActive: true,
      permissions: { viewLeads: true, viewClinical: true, editLeads: false },
      leadFields: restrictedFields,
    });

    expect(JSON.stringify(safe)).not.toContain("PRIVATE_");
    expect(safe.status).toBe("paid");
    expect(safe.leadStatus).toBeNull();
    expect(safe.customerName).toBe("");
    expect(safe.leadFirstName).toBe("");
    expect(safe.leadLastName).toBe("");
    expect(safe.leadEmail).toBeNull();
    expect(source.leadLastName).toBe("PRIVATE_LAST");
    expect(source.auditEvents[0]?.snapshotBefore).toContain("PRIVATE_BEFORE_EMAIL");
  });

  it("redacts flattened and nested sales router results while preserving order status and actor metadata", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissionRecord({ viewLeads: true, viewClinical: true, manageSales: false }, restrictedFields));
    vi.spyOn(salesDb, "listCustomers").mockResolvedValue({
      items: [{ id: 8, fullName: "PRIVATE_FULL_NAME", firstName: "PRIVATE_FIRST", lastName: "PRIVATE_LAST", email: "PRIVATE_EMAIL", leadStatus: "customer", orderCount: 2 }],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    } as never);
    const result = await appRouter.createCaller(context()).customers.list({});
    expect(JSON.stringify(result)).not.toContain("PRIVATE_");
    expect(result.items[0]?.fullName).toBe("");
    expect(result.items[0]?.leadStatus).toBeNull();
    expect(result.items[0]?.orderCount).toBe(2);

    vi.spyOn(salesDb, "getSalesOrder").mockResolvedValue({
      order: { id: 9, status: "paid", notes: "PRIVATE_ORDER_NOTE" },
      customer: { customerName: "PRIVATE_CUSTOMER_NAME", leadEmail: "PRIVATE_EMAIL" },
      auditEvents: [{ actorName: "Visible Actor", snapshotAfter: { orderId: 9, status: "paid", email: "PRIVATE_AUDIT_EMAIL" } }],
    } as never);
    const order = await appRouter.createCaller(context()).orders.get({ id: 9 });
    expect(JSON.stringify(order)).not.toContain("PRIVATE_");
    expect(order.order.status).toBe("paid");
  });

  it("keeps direct mail independent from lead lookup and retains permitted email when clinical access is false", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissionRecord({ manageEmails: true, viewLeads: true, viewClinical: false }));
    const getRecipient = vi.spyOn(db, "getEmailRecipient");
    vi.spyOn(db, "getStaffSmtpSettings").mockResolvedValue({
      userId: staff.id,
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpSecurity: "starttls",
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
    });
    vi.spyOn(db, "getEmailTemplate").mockResolvedValue(undefined);
    vi.spyOn(db, "addOutboundEmail").mockResolvedValue(12);
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail").mockResolvedValue({ configured: true, sent: true, error: null, messageId: "direct" });

    await expect(appRouter.createCaller(context()).mail.send({ recipientEmail: "direct@example.com", recipientName: "Direct Recipient", subject: "Direct canary", bodyText: "Direct body" })).resolves.toMatchObject({ success: true, linkedToLead: false });
    expect(getRecipient).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);

    vi.spyOn(db, "listOutboundEmails").mockResolvedValue([{
      id: 12,
      senderUserId: staff.id,
      recipientEmail: "permitted@example.com",
      recipientName: "Permitted Recipient",
      subject: "PRIVATE_SUBJECT",
      bodyHtml: "PRIVATE_BODY",
      ccEmails: ["copy@example.com"],
      bccEmails: ["private@example.com"],
    }] as never);
    const history = await appRouter.createCaller(context()).mail.history();
    expect(history[0]?.recipientEmail).toBe("permitted@example.com");
    expect(history[0]?.subject).toBe("Protected message");
    expect(history[0]?.bodyHtml).toBe("");
    expect(JSON.stringify(history)).not.toContain("PRIVATE_");
  });

  it("denies scanner extraction before invoking the scanner when any lead field is hidden", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissionRecord({ scanDocuments: true, viewClinical: true, viewLeads: true }, { ...allFields, email: "hide" }));
    const extract = vi.spyOn(scannerExtraction, "extractScannerImages");
    await expect(appRouter.createCaller(context()).scanner.extract({ files: [{ name: "scan.png", mimeType: "image/png", dataUrl: "data:image/png;base64,AA==" }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(extract).not.toHaveBeenCalled();
  });

  it("sends Super Admin reminders without a user lookup and skips restricted staff copies fail-closed", async () => {
    const baseDelivery = {
      id: 21,
      leadId: 42,
      firstName: "PRIVATE_FIRST",
      lastName: "PRIVATE_LAST",
      leadEmail: "lead@example.com",
      stateCode: "CA",
      scheduledFor: Date.UTC(2026, 10, 20, 22, 0),
      staffName: "Reminder Staff",
      staffEmail: "staff@example.com",
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpSecurity: "starttls" as const,
      smtpUsername: "staff@example.com",
      smtpPassword: "secret",
      smtpFromEmail: "staff@example.com",
      smtpFromName: "Reminder Staff",
      smtpReplyToEmail: null,
      smtpEnabled: true,
      smtpVerifiedAt: Date.now(),
      leadPreferredLanguage: "en" as const,
      staffEmailStatus: "pending" as const,
      leadEmailStatus: "pending" as const,
      attempts: 0,
    };
    const rows = vi.spyOn(db, "getDueFollowUpReminderDeliveries").mockResolvedValue([{ ...baseDelivery, recipientUserId: SYSTEM_ADMIN_ACTOR_ID }]);
    const getUser = vi.spyOn(db, "getUserById");
    vi.spyOn(db, "addOutboundEmail").mockResolvedValue(15);
    vi.spyOn(db, "updateFollowUpDelivery").mockResolvedValue();
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail").mockResolvedValue({ configured: true, sent: true, error: null, messageId: "reminder" });
    await expect(processDueFollowUpReminders()).resolves.toMatchObject({ due: 1, sent: 2, failed: 0 });
    expect(rows).toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[1].text).toContain("PRIVATE_FIRST PRIVATE_LAST");

    vi.restoreAllMocks();
    vi.spyOn(db, "getDueFollowUpReminderDeliveries").mockResolvedValue([{ ...baseDelivery, recipientUserId: 18 }]);
    vi.spyOn(db, "getUserById").mockResolvedValue({ id: 18, role: "user" } as never);
    vi.spyOn(permissions, "getUserAccess").mockResolvedValue({ role: "technical_staff", isActive: true, permissions: { viewLeads: true, viewClinical: true, manageContacts: true }, leadFields: { ...allFields, firstName: "hide", lastName: "hide", nextFollowUpAt: "hide" } });
    const restrictedSend = vi.spyOn(smtp, "sendStaffSmtpEmail").mockResolvedValue({ configured: true, sent: true, error: null, messageId: "lead-only" });
    vi.spyOn(db, "addOutboundEmail").mockResolvedValue(16);
    const update = vi.spyOn(db, "updateFollowUpDelivery").mockResolvedValue();
    await expect(processDueFollowUpReminders()).resolves.toMatchObject({ due: 1, sent: 1, failed: 0 });
    expect(restrictedSend).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(21, expect.objectContaining({ staffEmailStatus: "skipped", leadEmailStatus: "sent" }));
  });
});
