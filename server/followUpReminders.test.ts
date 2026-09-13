import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { buildFollowUpMessages, processDueFollowUpReminders } from "./followUpReminders";
import * as smtp from "./smtp";

const delivery = {
  id: 7,
  leadId: 11,
  firstName: "Ana",
  lastName: "Diaz",
  leadEmail: "ana@example.com",
  stateCode: "CA",
  scheduledFor: Date.UTC(2026, 8, 12, 18, 0),
  recipientUserId: 3,
  staffName: "Luis",
  staffEmail: "luis@example.com",
  smtpHost: "smtp.example.com",
  smtpPort: 587,
  smtpSecurity: "starttls" as const,
  smtpUsername: "luis@example.com",
  smtpPassword: "smtp-password",
  smtpFromEmail: "luis@example.com",
  smtpFromName: "Luis",
  smtpReplyToEmail: null,
  smtpEnabled: true,
  smtpVerifiedAt: Date.UTC(2026, 8, 1),
  leadPreferredLanguage: "es" as const,
  staffEmailStatus: "pending" as const,
  leadEmailStatus: "pending" as const,
  attempts: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("follow-up reminders", () => {
  it("keeps staff copy in English and creates Spanish copy for a Spanish-speaking lead", () => {
    const copy = buildFollowUpMessages(delivery);
    expect(copy.staffSubject).toContain("Reminder");
    expect(copy.staffText).toContain("Ana Diaz");
    expect(copy.leadSubject).toContain("seguimiento");
    expect(copy.leadText).toContain("Hola Ana");
  });

  it("uses English copy by default", () => {
    const copy = buildFollowUpMessages({ ...delivery, leadPreferredLanguage: "en" });
    expect(copy.staffSubject).toContain("Reminder");
    expect(copy.leadText).toContain("scheduled follow-up");
  });

  it("records failed delivery without consuming retries when assigned staff SMTP is not configured", async () => {
    vi.spyOn(db, "getDueFollowUpReminderDeliveries").mockResolvedValue([{ ...delivery, smtpEnabled: false, smtpPassword: "", smtpVerifiedAt: null }]);
    const update = vi.spyOn(db, "updateFollowUpDelivery").mockResolvedValue();
    const result = await processDueFollowUpReminders();
    expect(result).toMatchObject({ configured: false, due: 1, configuredRows: 0, sent: 0, failed: 2 });
    expect(update).toHaveBeenCalledWith(7, expect.objectContaining({
      staffEmailStatus: "failed",
      leadEmailStatus: "failed",
      attempts: 0,
      lastError: expect.stringContaining("responsible account SMTP profile"),
    }));
  });

  it("sends both messages from the assigned staff SMTP account", async () => {
    vi.spyOn(db, "getDueFollowUpReminderDeliveries").mockResolvedValue([delivery]);
    const update = vi.spyOn(db, "updateFollowUpDelivery").mockResolvedValue();
    const send = vi.spyOn(smtp, "sendStaffSmtpEmail").mockResolvedValue({ configured: true, sent: true, error: null, messageId: "email-id" });
    const result = await processDueFollowUpReminders(delivery.scheduledFor - 2 * 60 * 60 * 1000);
    expect(result).toMatchObject({ configured: true, due: 1, configuredRows: 1, sent: 2, failed: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ smtpUsername: "luis@example.com", fromEmail: "luis@example.com" });
    expect(update).toHaveBeenCalledWith(7, expect.objectContaining({ staffEmailStatus: "sent", leadEmailStatus: "sent", attempts: 1 }));
  });
});
