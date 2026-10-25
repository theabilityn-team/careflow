const EMAIL_HTML_PATTERN = /(?:<!doctype\s+html|<html(?:\s|>)|<body(?:\s|>)|<(?:table|div|section|main|header|footer|p|h[1-6]|img|a)(?:\s|>))/i;

type TestSenderAccount = {
  userId: number;
  isActive: boolean;
  smtpEnabled: boolean;
  smtpVerifiedAt: number | null;
};

export function looksLikeEmailHtml(value: string) {
  return EMAIL_HTML_PATTERN.test(value.trim());
}

export function preferredTestSenderUserId(accounts?: TestSenderAccount[]) {
  return accounts?.find(account => account.isActive && account.smtpEnabled && account.smtpVerifiedAt)?.userId
    ?? accounts?.find(account => account.isActive && account.smtpEnabled)?.userId;
}

/** Suggest a new library name; the database still enforces uniqueness on save. */
export function nextEmailCopyName(sourceName: string, existingNames: string[]) {
  const base = sourceName.trim().replace(/ \(copy(?: \d+)?\)$/i, "");
  const used = new Set(existingNames.map(name => name.trim().toLocaleLowerCase("en-US")));
  for (let number = 1; ; number++) {
    const suffix = number === 1 ? " (copy)" : ` (copy ${number})`;
    const candidate = base.slice(0, 160 - suffix.length).trimEnd() + suffix;
    if (!used.has(candidate.toLocaleLowerCase("en-US"))) return candidate;
  }
}
