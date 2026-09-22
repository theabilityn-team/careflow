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
