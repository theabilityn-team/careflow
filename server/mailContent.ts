import sanitizeHtml from "sanitize-html";

export const DEFAULT_EMAIL_HEADER_HTML = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0f766e" style="width:100%;background-color:#0f766e"><tr><td style="padding:18px 24px;color:#ffffff;font-family:Arial,sans-serif"><strong style="font-size:20px">CareFlow</strong></td></tr></table>`;
export const DEFAULT_EMAIL_FOOTER_HTML = `<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e2e8f0;color:#475569;font-family:Arial,sans-serif;font-size:13px"><p>Best regards,<br><strong>{{senderName}}</strong></p><p>Please reply directly to this email if you need assistance.</p></div>`;

const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: ["div", "p", "span", "strong", "b", "em", "i", "u", "a", "br", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "img", "h1", "h2", "h3", "h4", "ul", "ol", "li", "hr", "blockquote", "small"],
  allowedAttributes: {
    "*": ["style"],
    a: ["href", "target", "rel", "style"],
    img: ["src", "alt", "width", "height", "border", "style"],
    table: ["width", "cellpadding", "cellspacing", "border", "role", "align", "bgcolor", "style"],
    tr: ["align", "valign", "bgcolor", "style"],
    th: ["width", "colspan", "rowspan", "align", "valign", "bgcolor", "style"],
    td: ["width", "colspan", "rowspan", "align", "valign", "bgcolor", "style"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
  },
  allowedStyles: {
    "*": {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i, /^[a-z]+$/i],
      "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i, /^[a-z]+$/i],
      "font-family": [/^[a-z0-9 ,.'"-]+$/i],
      "font-size": [/^\d+(px|pt|em|rem|%)$/],
      "font-weight": [/^(normal|bold|[1-9]00)$/],
      "line-height": [/^\d+(\.\d+)?(px|em|rem|%)?$/],
      "text-align": [/^(left|right|center|justify)$/],
      "vertical-align": [/^(top|middle|bottom|baseline)$/],
      "text-decoration": [/^(none|underline)$/],
      padding: [/^[0-9 .pxemrem%-]+$/],
      "padding-top": [/^[0-9 .pxemrem%-]+$/],
      "padding-right": [/^[0-9 .pxemrem%-]+$/],
      "padding-bottom": [/^[0-9 .pxemrem%-]+$/],
      "padding-left": [/^[0-9 .pxemrem%-]+$/],
      margin: [/^[0-9 .pxemrem%-]+$/],
      "margin-top": [/^[0-9 .pxemrem%-]+$/],
      "margin-right": [/^[0-9 .pxemrem%-]+$/],
      "margin-bottom": [/^[0-9 .pxemrem%-]+$/],
      "margin-left": [/^[0-9 .pxemrem%-]+$/],
      border: [/^[0-9a-z #().,-]+$/i],
      "border-top": [/^[0-9a-z #().,-]+$/i],
      "border-bottom": [/^[0-9a-z #().,-]+$/i],
      "border-radius": [/^[0-9 .pxemrem%]+$/],
      "border-collapse": [/^(collapse|separate)$/],
      width: [/^[0-9.]+(px|%)$/],
      "max-width": [/^[0-9.]+(px|%)$/],
      height: [/^[0-9.]+(px|%)$/],
      display: [/^(block|inline|inline-block|table|table-row|table-cell)$/],
    },
  },
};

export type EmailTemplateVariables = {
  leadFirstName: string;
  leadFullName: string;
  senderName: string;
  senderEmail: string;
};

export const EMAIL_FRAME_PREVIEW_VARIABLES: EmailTemplateVariables = {
  leadFirstName: "Alex",
  leadFullName: "Alex Morgan",
  senderName: "CareFlow Team",
  senderEmail: "sender@example.com",
};

export const EMAIL_FRAME_PREVIEW_BODY_HTML = `<div style="padding:8px 0"><p style="margin:0 0 8px;font-size:13px;font-weight:700;line-height:1.4;color:#0f766e">SAMPLE EMAIL CONTENT</p><h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;color:#0f172a">Hello {{leadFirstName}},</h1><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#475569">This sample message shows exactly where the email content appears between the global header and footer.</p><p style="margin:0;font-size:15px;line-height:1.65;color:#475569">The preview uses safe example values for <strong>{{senderName}}</strong> and <strong>{{senderEmail}}</strong>.</p></div>`;

export function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

export function sanitizeTemplateHtml(value: string) {
  const bodyOnly = (value || "")
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");
  return sanitizeHtml(bodyOnly, sanitizeOptions).trim();
}

export function renderTemplateTokens(value: string, variables: EmailTemplateVariables) {
  return value.replace(/\{\{(leadFirstName|leadFullName|senderName|senderEmail)\}\}/g, (_match, key: keyof EmailTemplateVariables) => escapeHtml(variables[key]));
}

export function renderTextTokens(value: string, variables: EmailTemplateVariables) {
  return value.replace(/\{\{(leadFirstName|leadFullName|senderName|senderEmail)\}\}/g, (_match, key: keyof EmailTemplateVariables) => variables[key]);
}

function linkifyPlainText(value: string) {
  return value.split(/(https?:\/\/[^\s<]+)/gi).map(part => {
    if (!/^https?:\/\//i.test(part)) return escapeHtml(part);
    const trailing = part.match(/[),.!?;:]+$/)?.[0] ?? "";
    const candidate = trailing ? part.slice(0, -trailing.length) : part;
    try {
      const url = new URL(candidate);
      if (url.protocol !== "https:" && url.protocol !== "http:") return escapeHtml(part);
      const safeUrl = escapeHtml(url.toString());
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(candidate)}</a>${escapeHtml(trailing)}`;
    } catch {
      return escapeHtml(part);
    }
  }).join("");
}

export function composeEmailHtml(headerHtml: string, bodyText: string, footerHtml: string, variables: EmailTemplateVariables) {
  const body = bodyText.split(/\n{2,}/).map(paragraph => `<p style="margin:0 0 14px">${linkifyPlainText(paragraph).replaceAll("\n", "<br>")}</p>`).join("");
  return composeRichEmailHtml(headerHtml, body, footerHtml, variables);
}

export function composeRichEmailHtml(headerHtml: string, bodyHtml: string, footerHtml: string, variables: EmailTemplateVariables) {
  const renderedHeader = renderTemplateTokens(sanitizeTemplateHtml(headerHtml), variables);
  const renderedBody = renderTemplateTokens(sanitizeTemplateHtml(bodyHtml), variables);
  const renderedFooter = renderTemplateTokens(sanitizeTemplateHtml(footerHtml), variables);
  return `<div style="margin:0 auto;max-width:680px;font-family:Arial,sans-serif;color:#0f172a;line-height:1.6">${renderedHeader}<div style="padding:24px">${renderedBody}${renderedFooter}</div></div>`;
}

export function composeEmailFramePreview(headerHtml: string, footerHtml: string) {
  return composeRichEmailHtml(headerHtml, EMAIL_FRAME_PREVIEW_BODY_HTML, footerHtml, EMAIL_FRAME_PREVIEW_VARIABLES);
}

export function htmlToPlainText(value: string) {
  return sanitizeHtml(value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n"), { allowedTags: [], allowedAttributes: {} })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
