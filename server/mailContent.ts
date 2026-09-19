import sanitizeHtml from "sanitize-html";

export const DEFAULT_EMAIL_HEADER_HTML = `<div style="padding:20px 24px;background:#0f766e;color:#ffffff;font-family:Arial,sans-serif"><strong style="font-size:20px">CareFlow</strong></div>`;
export const DEFAULT_EMAIL_FOOTER_HTML = `<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e2e8f0;color:#475569;font-family:Arial,sans-serif;font-size:13px"><p>Best regards,<br><strong>{{senderName}}</strong></p><p>Please reply directly to this email if you need assistance.</p></div>`;

const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: ["div", "p", "span", "strong", "b", "em", "i", "u", "a", "br", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "img", "h1", "h2", "h3", "h4", "ul", "ol", "li", "hr", "blockquote", "small"],
  allowedAttributes: {
    "*": ["style"],
    a: ["href", "target", "rel", "style"],
    img: ["src", "alt", "width", "height", "style"],
    table: ["width", "cellpadding", "cellspacing", "style"],
    th: ["width", "colspan", "rowspan", "style"],
    td: ["width", "colspan", "rowspan", "style"],
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

export function composeEmailHtml(headerHtml: string, bodyText: string, footerHtml: string, variables: EmailTemplateVariables) {
  const body = bodyText.split(/\n{2,}/).map(paragraph => `<p style="margin:0 0 14px">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("");
  return composeRichEmailHtml(headerHtml, body, footerHtml, variables);
}

export function composeRichEmailHtml(headerHtml: string, bodyHtml: string, footerHtml: string, variables: EmailTemplateVariables) {
  const renderedHeader = renderTemplateTokens(sanitizeTemplateHtml(headerHtml), variables);
  const renderedBody = renderTemplateTokens(sanitizeTemplateHtml(bodyHtml), variables);
  const renderedFooter = renderTemplateTokens(sanitizeTemplateHtml(footerHtml), variables);
  return `<div style="margin:0 auto;max-width:680px;font-family:Arial,sans-serif;color:#0f172a;line-height:1.6">${renderedHeader}<div style="padding:24px">${renderedBody}${renderedFooter}</div></div>`;
}

export function htmlToPlainText(value: string) {
  return sanitizeHtml(value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n"), { allowedTags: [], allowedAttributes: {} })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
