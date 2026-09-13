import nodemailer from "nodemailer";

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

export function safeSmtpError(error: unknown, password?: string) {
  const original = error instanceof Error ? error.message : "SMTP connection failed.";
  const withoutPassword = password ? original.replaceAll(password, "[redacted]") : original;
  return withoutPassword.replace(/\s+/g, " ").trim().slice(0, 500) || "SMTP connection failed.";
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

export async function sendStaffSmtpEmail(settings: StaffSmtpConfig, input: { to: string; subject: string; text: string; html?: string }) {
  if (!isSmtpConfigured(settings)) return { configured: false as const, sent: false as const, error: "The assigned staff SMTP account is not configured and enabled." };
  try {
    const result = await transporter(settings).sendMail({
      from: { name: settings.fromName.trim() || "CareFlow", address: settings.fromEmail.trim() },
      replyTo: settings.replyToEmail?.trim() || settings.fromEmail.trim(),
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { configured: true as const, sent: true as const, error: null, messageId: result.messageId };
  } catch (error) {
    return { configured: true as const, sent: false as const, error: safeSmtpError(error, settings.smtpPassword) };
  }
}
