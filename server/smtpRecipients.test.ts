import { afterEach, describe, expect, it, vi } from "vitest";

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  const createTransport = vi.fn(() => ({ sendMail, verify: vi.fn() }));
  return { sendMail, createTransport };
});
vi.mock("nodemailer", () => ({ default: { createTransport } }));

import { normalizeMailRecipients, parseEmailAddressList } from "../shared/emailRecipients";
import { sendStaffSmtpEmail } from "./smtp";

const settings = { smtpHost: "smtp.example.com", smtpPort: 587, smtpSecurity: "starttls" as const, smtpUsername: "staff@example.com", smtpPassword: "smtp-secret", fromEmail: "staff@example.com", fromName: "Staff", replyToEmail: null, isEnabled: true };

afterEach(() => {
  vi.clearAllMocks();
});

describe("SMTP recipient handling", () => {
  it("normalizes and deduplicates To, CC, then BCC and uses BCC as a transport field", async () => {
    sendMail.mockResolvedValue({ messageId: "smtp-1" });
    const result = await sendStaffSmtpEmail(settings, {
      to: "To@Example.com",
      cc: ["to@example.com", "CC@example.com"],
      bcc: ["cc@example.com", "BCC@example.com"],
      subject: "Subject",
      text: "Body",
      html: "<p>Body</p>",
    });

    expect(result).toMatchObject({ configured: true, sent: true, messageId: "smtp-1" });
    expect(sendMail).toHaveBeenCalledOnce();
    const message = sendMail.mock.calls[0]?.[0];
    expect(message.to).toBe("to@example.com");
    expect(message.cc).toEqual(["cc@example.com"]);
    expect(message.bcc).toBeUndefined();
    expect(message.envelope.to).toEqual(["to@example.com", "cc@example.com", "bcc@example.com"]);
    expect(message.subject).toBe("Subject");
    expect(message.text).toBe("Body");
    expect(message.html).toBe("<p>Body</p>");
    expect(message.subject).not.toContain("bcc@example.com");
    expect(message.text).not.toContain("bcc@example.com");
  });

  it("rejects header injection, malformed addresses, and more than 20 CC/BCC recipients without transport", async () => {
    expect(() => parseEmailAddressList("a@example.com,,b@example.com")).toThrow(/empty/i);
    expect(() => parseEmailAddressList("Bcc: evil@example.com")).toThrow(/valid/i);
    expect(() => normalizeMailRecipients({ to: "to@example.com\r\nBcc: evil@example.com" })).toThrow(/line breaks/i);
    const many = Array.from({ length: 21 }, (_, index) => `user${index}@example.com`);
    expect(() => normalizeMailRecipients({ to: "to@example.com", cc: many })).toThrow(/20/i);

    const result = await sendStaffSmtpEmail(settings, { to: "to@example.com\r\nBcc:evil@example.com", subject: "Subject", text: "Body" });
    expect(result.sent).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("keeps BCC in the SMTP envelope but out of the generated MIME headers without any network", async () => {
    const actual = await vi.importActual<any>("nodemailer");
    const transport = (actual.default ?? actual).createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    const result = await transport.sendMail({ from: "sender@example.com", to: "to@example.com", cc: ["copy@example.com"], envelope: { from: "sender@example.com", to: ["to@example.com", "copy@example.com", "private@example.com"] }, subject: "Fake only", text: "Fake body" });
    expect(result.envelope.to).toContain("private@example.com");
    expect(result.envelope.to).toContain("copy@example.com");
    const message = result.message.toString();
    expect(message).not.toMatch(/^Bcc:/mi);
    expect(message).not.toContain("private@example.com");
    expect(message).toContain("copy@example.com");
  });
});
