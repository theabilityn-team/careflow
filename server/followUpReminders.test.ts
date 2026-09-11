import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { buildFollowUpMessages, processDueFollowUpReminders } from "./followUpReminders";

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
  leadPreferredLanguage: "es" as const,
  staffEmailStatus: "pending" as const,
  leadEmailStatus: "pending" as const,
  attempts: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.REMINDER_FROM_EMAIL;
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

  it("does not consume attempts when email provider is not configured", async () => {
    vi.spyOn(db, "getDueFollowUpReminderDeliveries").mockResolvedValue([delivery]);
    const update = vi.spyOn(db, "updateFollowUpDelivery").mockResolvedValue();
    await expect(processDueFollowUpReminders()).resolves.toEqual({ configured: false, due: 1, sent: 0, failed: 0 });
    expect(update).not.toHaveBeenCalled();
  });

  it("marks both staff and lead emails sent when the provider accepts them", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.REMINDER_FROM_EMAIL = "CareFlow <reminders@example.com>";
    vi.spyOn(db, "getDueFollowUpReminderDeliveries").mockResolvedValue([delivery]);
    const update = vi.spyOn(db, "updateFollowUpDelivery").mockResolvedValue();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-id" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await processDueFollowUpReminders(delivery.scheduledFor - 2 * 60 * 60 * 1000);
    expect(result).toMatchObject({ configured: true, due: 1, sent: 2, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(7, expect.objectContaining({ staffEmailStatus: "sent", leadEmailStatus: "sent", attempts: 1 }));
  });
});
