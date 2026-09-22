const EMAIL_HTML_PATTERN = /(?:<!doctype\s+html|<html(?:\s|>)|<body(?:\s|>)|<(?:table|div|section|main|header|footer|p|h[1-6]|img|a)(?:\s|>))/i;

export function looksLikeEmailHtml(value: string) {
  return EMAIL_HTML_PATTERN.test(value.trim());
}
