import { describe, expect, it } from "vitest";
import { composeEmailHtml, htmlToPlainText, renderTextTokens, sanitizeTemplateHtml } from "./mailContent";

const variables = {
  leadFirstName: "Ana <Patient>",
  leadFullName: "Ana <Patient> Rivera",
  senderName: "Sam & CareFlow",
  senderEmail: "sam@example.com",
};

describe("email template content", () => {
  it("removes scripts and event handlers from editable HTML", () => {
    const result = sanitizeTemplateHtml('<div onclick="steal()"><script>alert(1)</script><strong>Safe</strong><img src="https://example.com/a.png" onerror="steal()"></div>');
    expect(result).toContain("<strong>Safe</strong>");
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

  it("renders text tokens without HTML encoding and produces a text alternative", () => {
    expect(renderTextTokens("Hello {{leadFirstName}} from {{senderEmail}}", variables)).toBe("Hello Ana <Patient> from sam@example.com");
    expect(htmlToPlainText("<p>Hello Ana</p><p>Second line</p>")).toContain("Hello Ana");
    expect(htmlToPlainText("<p>Hello Ana</p><p>Second line</p>")).toContain("Second line");
  });
});
