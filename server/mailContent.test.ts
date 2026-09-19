import { describe, expect, it } from "vitest";
import { composeEmailHtml, composeRichEmailHtml, htmlToPlainText, renderTextTokens, sanitizeTemplateHtml } from "./mailContent";

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
    const result = composeEmailHtml("<p>Hello {{leadFirstName}}</p>", "Your result is <ready> & safe.", "<p>{{senderName}}</p>", variables);
    expect(result).toContain("Ana &lt;Patient&gt;");
    expect(result).toContain("&lt;ready&gt; &amp; safe.");
    expect(result).toContain("Sam &amp; CareFlow");
  });

  it("sanitizes and personalizes a complete HTML message body", () => {
    const result = composeRichEmailHtml("<p>Header</p>", '<table onclick="bad()"><tr><td><h1>Hello {{leadFirstName}}</h1><script>bad()</script></td></tr></table>', "<p>{{senderName}}</p>", variables);
    expect(result).toContain("<table>");
    expect(result).toContain("Hello Ana &lt;Patient&gt;");
    expect(result).toContain("Sam &amp; CareFlow");
    expect(result).not.toContain("script");
    expect(result).not.toContain("onclick");
  });

  it("renders text tokens without HTML encoding and produces a text alternative", () => {
    expect(renderTextTokens("Hello {{leadFirstName}} from {{senderEmail}}", variables)).toBe("Hello Ana <Patient> from sam@example.com");
    expect(htmlToPlainText("<p>Hello Ana</p><p>Second line</p>")).toContain("Hello Ana");
    expect(htmlToPlainText("<p>Hello Ana</p><p>Second line</p>")).toContain("Second line");
  });
});
