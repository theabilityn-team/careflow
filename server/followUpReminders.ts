import * as db from "./db";
import { formatEasternLongDateTime } from "../shared/time";
import { createEmailTrackingToken, instrumentEmailHtml } from "./emailTracking";
import { isSmtpConfigured, sendStaffSmtpEmail, type StaffSmtpConfig } from "./smtp";

type Delivery = Awaited<ReturnType<typeof db.getDueFollowUpReminderDeliveries>>[number];
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);

function formattedTime(delivery: Delivery, language: "en" | "es") {
  return formatEasternLongDateTime(delivery.scheduledFor, language === "es" ? "es-US" : "en-US");
}

export function buildFollowUpMessages(delivery: Delivery) {
  const leadLanguage = delivery.leadPreferredLanguage === "es" ? "es" : "en";
  const leadName = `${delivery.firstName} ${delivery.lastName}`.trim();
  const staffTime = formattedTime(delivery, "en");
  const leadTime = formattedTime(delivery, leadLanguage);
  return {
    staffSubject: `Reminder: follow-up with ${leadName} in 2 hours`,
    staffText: `Hello ${delivery.staffName || ""},\n\nYou have a follow-up scheduled with ${leadName} on ${staffTime}. Open CareFlow to review the lead before the appointment.`,
    leadSubject: leadLanguage === "es" ? "Recordatorio de su seguimiento programado" : "Reminder for your scheduled follow-up",
    leadText: leadLanguage === "es"
      ? `Hola ${delivery.firstName},\n\nEste es un recordatorio de su seguimiento programado para el ${leadTime}. Si necesita cambiar el horario, responda al miembro del equipo que le contactó.`
      : `Hello ${delivery.firstName},\n\nThis is a reminder for your scheduled follow-up on ${leadTime}. If you need to change the time, please reply to the team member who contacted you.`,
  };
}

export function deliverySmtpSettings(delivery: Delivery): StaffSmtpConfig {
  return {
    smtpHost: delivery.smtpHost ?? "",
    smtpPort: delivery.smtpPort ?? 587,
    smtpSecurity: delivery.smtpSecurity ?? "starttls",
    smtpUsername: delivery.smtpUsername ?? "",
    smtpPassword: delivery.smtpPassword ?? "",
    fromEmail: delivery.smtpFromEmail ?? "",
    fromName: delivery.smtpFromName ?? delivery.staffName ?? "CareFlow",
    replyToEmail: delivery.smtpReplyToEmail,
    isEnabled: delivery.smtpEnabled ?? false,
  };
}

function reminderHtml(text: string) {
  return `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:620px"><h2 style="color:#0f766e">CareFlow reminder</h2><p>${escapeHtml(text).replaceAll("\n", "<br>")}</p></div>`;
}

export async function processDueFollowUpReminders(now = Date.now()) {
  const rows = await db.getDueFollowUpReminderDeliveries(now);
  const isReady = (row: Delivery) => Boolean(row.smtpVerifiedAt && isSmtpConfigured(deliverySmtpSettings(row)));
  const configuredRows = rows.filter(isReady).length;
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const copy = buildFollowUpMessages(row);
    const settings = deliverySmtpSettings(row);
    const send = (message: Parameters<typeof sendStaffSmtpEmail>[1]) => isReady(row)
      ? sendStaffSmtpEmail(settings, message)
      : Promise.resolve({ configured: false, sent: false, error: "The responsible account SMTP profile is not enabled, complete, and verified.", messageId: null });
    const values: Parameters<typeof db.updateFollowUpDelivery>[1] = { attempts: row.attempts + (isReady(row) ? 1 : 0), lastError: null };
    const errors: string[] = [];
    if (["pending", "failed"].includes(row.staffEmailStatus)) {
      if (!row.staffEmail) values.staffEmailStatus = "skipped";
      else {
        const result = await send({ to: row.staffEmail, subject: copy.staffSubject, text: copy.staffText, html: reminderHtml(copy.staffText) });
        values.staffEmailStatus = result.sent ? "sent" : "failed";
        if (result.sent) { values.staffSentAt = now; sent += 1; } else { errors.push(result.error || "Staff email failed."); failed += 1; }
      }
    }
    if (["pending", "failed"].includes(row.leadEmailStatus)) {
      if (!row.leadEmail) values.leadEmailStatus = "skipped";
      else {
        const html = reminderHtml(copy.leadText);
        const trackingToken = createEmailTrackingToken();
        const result = await send({ to: row.leadEmail, subject: copy.leadSubject, text: copy.leadText, html: instrumentEmailHtml(html, trackingToken) });
        if (isReady(row)) {
          try {
            await db.addOutboundEmail({
              senderUserId: row.recipientUserId,
              leadId: row.leadId,
              recipientEmail: row.leadEmail,
              recipientName: `${row.firstName} ${row.lastName}`.trim(),
              fromEmail: settings.fromEmail,
              productName: null,
              templateName: null,
              subject: copy.leadSubject,
              bodyHtml: html,
              status: result.sent ? "sent" : "failed",
              providerMessageId: result.sent ? result.messageId ?? null : null,
              error: result.error,
              trackingToken: result.sent ? trackingToken : null,
              sentAt: now,
            });
          } catch {
            errors.push("Lead email tracking history could not be recorded.");
          }
        }
        values.leadEmailStatus = result.sent ? "sent" : "failed";
        if (result.sent) { values.leadSentAt = now; sent += 1; } else { errors.push(result.error || "Lead email failed."); failed += 1; }
      }
    }
    values.lastError = errors.length ? Array.from(new Set(errors)).join(" | ") : null;
    await db.updateFollowUpDelivery(row.id, values);
  }
  return { configured: rows.length === 0 || configuredRows === rows.length, due: rows.length, configuredRows, sent, failed };
}
