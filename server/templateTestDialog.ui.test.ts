import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../client/src/components/ui/dialog", () => ({ useDialogComposition: () => null, ...Object.fromEntries(["Dialog", "DialogContent", "DialogHeader", "DialogFooter", "DialogTitle", "DialogDescription"].map(name => [name, ({ children }: any) => React.createElement("div", {}, children)])) }));
import { TemplateTestEmailDialog, templateTestRecipientError } from "../client/src/components/crm/TemplateTestEmailDialog";
const base = { open: true, onOpenChange: vi.fn(), template: { id: 8, name: "Selected template", contentMode: "html" as const }, recipientEmail: "destination@example.com", onRecipientChange: vi.fn(), onSend: vi.fn(), sending: false };
const render = (props = {}) => renderToStaticMarkup(React.createElement(TemplateTestEmailDialog, { ...base, ...props }));
beforeEach(() => { vi.stubGlobal("React", React); vi.clearAllMocks(); });
describe("template test recipient dialog", () => {
  it("staff shows explicit recipient textbox and only the assigned sender, without settings or account selector", () => {
    const html = render({ personal: true });
    expect(html).toContain('id="template-test-recipient"'); expect(html).toContain('type="email"'); expect(html).toContain('value="destination@example.com"'); expect(html).toContain('placeholder="recipient@example.com"');
    expect(html).toContain("Your assigned sender"); expect(html).toContain("Selected template"); expect(html).toContain("Test Recipient"); expect(html).not.toContain('id="template-test-sender"'); expect(html).not.toContain('href="/email-settings"'); expect(html).toContain('type="submit"'); expect(base.onSend).not.toHaveBeenCalled();
  });
  it("Admin retains sender choice and the recipient textbox", () => {
    const html = render({ senderUserId: "2", accounts: [{ userId: 2, name: "Staff sender", accountEmail: "staff@example.com", isActive: true, smtpEnabled: true, smtpFromEmail: "sender@example.com", smtpVerifiedAt: 123 }] });
    expect(html).toContain('id="template-test-sender"'); expect(html).toContain("Staff sender"); expect(html).toContain("sender@example.com"); expect(html).toContain('id="template-test-recipient"');
  });
  it.each(["", "wrong", "a@example.com,b@example.com", "recipient@example.com\r\nBcc: secret@example.com", "recipient@example.com\n"])("blocks invalid explicit recipient %j", value => {
    expect(templateTestRecipientError(value)).toBeTruthy(); const html = render({ personal: true, recipientEmail: value }); expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });
  it("accepts a single normalized recipient and locks fields, send and cancellation while pending", () => {
    expect(templateTestRecipientError(" Destination@Example.com ")).toBeNull(); const html = render({ personal: true, sending: true }); expect(html).toMatch(/<input[^>]*disabled/); expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/); expect(html).toMatch(/<button[^>]*type="button"[^>]*disabled/);
  });
  it("Admin cannot send from missing/inactive/disabled sender accounts", () => {
    for (const account of [undefined, { userId: 2, name: "Disabled", isActive: true, smtpEnabled: false }, { userId: 2, name: "Inactive", isActive: false, smtpEnabled: true }]) { expect(render({ senderUserId: "2", accounts: account ? [account] : [] })).toMatch(/<button[^>]*type="submit"[^>]*disabled/); }
  });
});
