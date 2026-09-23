import { describe, expect, it } from "vitest";
import { composeEmailFramePreview, composeEmailHtml, composeRichEmailHtml, htmlToPlainText, renderTextTokens, sanitizeTemplateHtml } from "./mailContent";

const variables = {
  leadFirstName: "Ana <Patient>",
  leadFullName: "Ana <Patient> Rivera",
  senderName: "Sam & CareFlow",
  senderEmail: "sam@example.com",
};

describe("email template content", () => {
  it("removes scripts and event handlers from editable HTML", () => {
    const result = sanitizeTemplateHtml('<!doctype html><html><head><title>Internal title</title><script>alert(1)</script></head><body><div onclick="steal()"><strong>Safe</strong><img src="https://example.com/a.png" onerror="steal()"></div></body></html>');
    expect(result).toContain("<strong>Safe</strong>");
    expect(result).not.toContain("Internal title");
    expect(result).not.toContain("script");
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("onerror");
  });

  it("escapes personalized values and plain message text in HTML", () => {
    const result = composeEmailHtml("<p>Hello {{leadFirstName}}</p>", "Your result is <ready> & safe. Visit https://example.com/offer.", "<p>{{senderName}}</p>", variables);
    expect(result).toContain("Ana &lt;Patient&gt;");
    expect(result).toContain("&lt;ready&gt; &amp; safe.");
    expect(result).toContain("Sam &amp; CareFlow");
    expect(result).toContain('<a href="https://example.com/offer"');
    expect(result).toContain("</a>.");
  });

  it("sanitizes and personalizes a complete HTML message body", () => {
    const result = composeRichEmailHtml("<p>Header</p>", '<table onclick="bad()"><tr><td><h1>Hello {{leadFirstName}}</h1><script>bad()</script></td></tr></table>', "<p>{{senderName}}</p>", variables);
    expect(result).toContain("<table>");
    expect(result).toContain("Hello Ana &lt;Patient&gt;");
    expect(result).toContain("Sam &amp; CareFlow");
    expect(result).not.toContain("script");
    expect(result).not.toContain("onclick");
  });

  it("preserves bulletproof email backgrounds and table alignment attributes", () => {
    const result = sanitizeTemplateHtml('<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="#071c1a" style="background-color:#071c1a"><tr><td align="center" valign="middle" bgcolor="#087f6c" style="background-color:#087f6c;color:#ffffff"><a href="https://example.com" style="color:#ffffff">Visible CTA</a></td></tr></table>');
    expect(result).toContain('role="presentation"');
    expect(result).toContain('align="center"');
    expect(result).toContain('bgcolor="#071c1a"');
    expect(result).toContain("background-color:#071c1a");
    expect(result).toContain('bgcolor="#087f6c"');
    expect(result).toContain("Visible CTA");
  });

  it("renders text tokens without HTML encoding and produces a text alternative", () => {
    expect(renderTextTokens("Hello {{leadFirstName}} from {{senderEmail}}", variables)).toBe("Hello Ana <Patient> from sam@example.com");
    expect(htmlToPlainText("<p>Hello Ana</p><p>Second line</p>")).toContain("Hello Ana");
    expect(htmlToPlainText("<p>Hello Ana</p><p>Second line</p>")).toContain("Second line");
  });

  it("builds a sanitized global frame preview with safe sample values", () => {
    const result = composeEmailFramePreview(
      '<header onclick="bad()">Welcome {{leadFirstName}}<script>bad()</script></header>',
      '<footer>Sent by {{senderName}} · {{senderEmail}}</footer>',
    );
    expect(result).toContain("Welcome Alex");
    expect(result).toContain("SAMPLE EMAIL CONTENT");
    expect(result).toContain("Sent by CareFlow Team · sender@example.com");
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("script");
  });
});
