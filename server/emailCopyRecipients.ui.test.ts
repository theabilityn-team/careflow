import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailCopyRecipients, EmailRecipientsSummary } from "../client/src/components/crm/EmailCopyRecipients";
import { hydrateOutboundRecipients, readStoredEmailAddresses } from "./outboundRecipients";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
describe("optional CC/BCC UI and safe history metadata", () => {
  it("has accessible, full-width optional copy controls without displaying empty fields", () => {
    const html = renderToStaticMarkup(React.createElement(EmailCopyRecipients, { cc: "", bcc: "", onCcChange: vi.fn(), onBccChange: vi.fn() }));
    expect(html).toContain("Add CC / BCC"); expect(html).toContain('aria-expanded="false"'); expect(html).not.toContain('<input');
  });
  it("renders populated copies in separate responsive fields and disables them while sending", () => {
    const html = renderToStaticMarkup(React.createElement(EmailCopyRecipients, { cc: "copy@example.com", bcc: "private@example.com", disabled: true, error: "Check recipient addresses.", onCcChange: vi.fn(), onBccChange: vi.fn() }));
    expect(html).toContain("sm:grid-cols-2"); expect(html).toContain("BCC"); expect(html).toContain("20 per field"); expect(html).toContain('role="alert"'); expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
  it("shows direct linkage and recipient metadata only when provided by the authorized API", () => {
    const html = renderToStaticMarkup(React.createElement(EmailRecipientsSummary, { leadId: null, ccEmails: ["copy@example.com"], bccEmails: ["private@example.com"] }));
    expect(html).toContain("Not linked to a lead"); expect(html).toContain("CC:"); expect(html).toContain("BCC (private):");
    expect(renderToStaticMarkup(React.createElement(EmailRecipientsSummary, { ccEmails: [], bccEmails: [] }))).toBe("");
  });
  it("reads JSON arrays from storage and treats old/corrupt/header-injected values as empty", () => {
    expect(readStoredEmailAddresses(null)).toEqual([]); expect(readStoredEmailAddresses("bad-json")).toEqual([]);
    expect(readStoredEmailAddresses('["safe@example.com",4]')).toEqual([]);
    expect(readStoredEmailAddresses(JSON.stringify(["address@example.com\r\nBcc: injection@example.com"]))).toEqual([]);
    expect(hydrateOutboundRecipients({ id: 1, senderUserId: 17, ccEmails: '["copy@example.com"]', bccEmails: null })).toMatchObject({ id: 1, senderUserId: 17, ccEmails: ["copy@example.com"], bccEmails: [] });
  });
});
