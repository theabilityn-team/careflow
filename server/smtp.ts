import nodemailer from "nodemailer";
import { normalizeMailRecipients } from "../shared/emailRecipients";

export type StaffSmtpConfig = {
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "tls" | "starttls" | "none";
  smtpUsername: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string | null;
  isEnabled: boolean;
};

export function isSmtpConfigured(settings: StaffSmtpConfig | null | undefined) {
  return Boolean(
    settings?.isEnabled &&
    settings.smtpHost.trim() &&
    settings.smtpPort > 0 &&
    settings.smtpUsername.trim() &&
    settings.smtpPassword &&
    settings.fromEmail.trim(),
  );
}

export function smtpTransportOptions(settings: StaffSmtpConfig) {
  return {
    host: settings.smtpHost.trim(),
    port: settings.smtpPort,
    secure: settings.smtpSecurity === "tls",
    requireTLS: settings.smtpSecurity === "starttls",
    auth: {
      user: settings.smtpUsername.trim(),
      pass: settings.smtpPassword,
    },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
  } as const;
}

export function safeSmtpError(error: unknown, password?: string, sensitiveAddresses: string[] = []) {
  const original = error instanceof Error ? error.message : "SMTP connection failed.";
  const redact = (message: string, secret: string) => {
    if (!secret) return message;
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return message.replace(new RegExp(escaped, "gi"), "[redacted]");
  };
  const withoutSecrets = password ? redact(original, password) : original;
  const withoutAddresses = sensitiveAddresses.reduce((message, address) => redact(message, address), withoutSecrets);
  return withoutAddresses.replace(/\s+/g, " ").trim().slice(0, 500) || "SMTP connection failed.";
}

function transporter(settings: StaffSmtpConfig) {
  return nodemailer.createTransport(smtpTransportOptions(settings));
}

export async function verifyStaffSmtp(settings: StaffSmtpConfig) {
  if (!isSmtpConfigured(settings)) return { ok: false as const, error: "Complete and enable all required SMTP settings first." };
  try {
    await transporter(settings).verify();
    return { ok: true as const, error: null };
  } catch (error) {
    return { ok: false as const, error: safeSmtpError(error, settings.smtpPassword) };
  }
}

export async function sendStaffSmtpEmail(settings: StaffSmtpConfig, input: { to: string; cc?: string[]; bcc?: string[]; subject: string; text: string; html?: string }) {
  if (!isSmtpConfigured(settings)) return { configured: false as const, sent: false as const, error: "The responsible SMTP account is not configured and enabled." };
  let recipients: ReturnType<typeof normalizeMailRecipients>;
  try {
    recipients = normalizeMailRecipients({ to: input.to, cc: input.cc, bcc: input.bcc });
  } catch (error) {
    return { configured: true as const, sent: false as const, error: error instanceof Error ? error.message : "Enter valid email recipients." };
  }
  try {
    const message: Parameters<ReturnType<typeof transporter>["sendMail"]>[0] = {
      from: { name: settings.fromName.trim() || "CareFlow", address: settings.fromEmail.trim() },
      replyTo: settings.replyToEmail?.trim() || settings.fromEmail.trim(),
      to: recipients.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    };
    if (recipients.cc.length) message.cc = recipients.cc;
    if (recipients.bcc.length) message.envelope = {
      from: settings.fromEmail.trim(),
      to: [recipients.to, ...recipients.cc, ...recipients.bcc],
    };
    const result = await transporter(settings).sendMail(message);
    return { configured: true as const, sent: true as const, error: null, messageId: result.messageId };
  } catch (error) {
    return { configured: true as const, sent: false as const, error: safeSmtpError(error, settings.smtpPassword, [recipients.to, ...recipients.cc, ...recipients.bcc]) };
  }
}
