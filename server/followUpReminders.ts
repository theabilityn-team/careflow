import * as db from "./db";

type Delivery = Awaited<ReturnType<typeof db.getDueFollowUpReminderDeliveries>>[number];
const stateTimeZones: Record<string, string> = { FL: "America/New_York", AZ: "America/Phoenix", NV: "America/Los_Angeles", CA: "America/Los_Angeles", OR: "America/Los_Angeles" };
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);

function formattedTime(delivery: Delivery, language: "en" | "es") {
  return new Date(delivery.scheduledFor).toLocaleString(language === "es" ? "es-US" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: stateTimeZones[delivery.stateCode ?? ""] ?? "America/New_York",
  });
}

export function buildFollowUpMessages(delivery: Delivery) {
  const language = delivery.preferredLanguage === "es" ? "es" : "en";
  const leadName = `${delivery.firstName} ${delivery.lastName}`.trim();
  const time = formattedTime(delivery, language);
  if (language === "es") return {
    staffSubject: `Recordatorio: seguimiento con ${leadName} en 2 horas`,
    staffText: `Hola ${delivery.staffName || ""},\n\nTiene un seguimiento programado con ${leadName} el ${time}. Abra CareFlow para revisar el registro antes de la cita.`,
    leadSubject: "Recordatorio de su seguimiento programado",
    leadText: `Hola ${delivery.firstName},\n\nEste es un recordatorio de su seguimiento programado para el ${time}. Si necesita cambiar el horario, responda al miembro del equipo que le contactó.`,
  };
  return {
    staffSubject: `Reminder: follow-up with ${leadName} in 2 hours`,
    staffText: `Hello ${delivery.staffName || ""},\n\nYou have a follow-up scheduled with ${leadName} on ${time}. Open CareFlow to review the lead before the appointment.`,
    leadSubject: "Reminder for your scheduled follow-up",
    leadText: `Hello ${delivery.firstName},\n\nThis is a reminder for your scheduled follow-up on ${time}. If you need to change the time, please reply to the team member who contacted you.`,
  };
}

async function sendEmail(input: { to: string; subject: string; text: string; idempotencyKey: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM_EMAIL;
  if (!apiKey || !from) return { configured: false, sent: false, error: "Email provider is not configured." };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:620px"><h2 style="color:#0f766e">CareFlow reminder</h2><p>${escapeHtml(input.text).replaceAll("\n", "<br>")}</p></div>`,
      }),
    });
    if (response.ok) return { configured: true, sent: true, error: null };
    return { configured: true, sent: false, error: `Email API ${response.status}: ${(await response.text()).slice(0, 500)}` };
  } catch (error) {
    return { configured: true, sent: false, error: error instanceof Error ? error.message : "Email network request failed." };
  }
}

export async function processDueFollowUpReminders(now = Date.now()) {
  const rows = await db.getDueFollowUpReminderDeliveries(now);
  if (!process.env.RESEND_API_KEY || !process.env.REMINDER_FROM_EMAIL) return { configured: false, due: rows.length, sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const copy = buildFollowUpMessages(row);
    const values: Parameters<typeof db.updateFollowUpDelivery>[1] = { attempts: row.attempts + 1, lastError: null };
    const errors: string[] = [];
    if (["pending", "failed"].includes(row.staffEmailStatus)) {
      if (!row.staffEmail) values.staffEmailStatus = "skipped";
      else {
        const result = await sendEmail({ to: row.staffEmail, subject: copy.staffSubject, text: copy.staffText, idempotencyKey: `followup-${row.id}-staff-${row.scheduledFor}` });
        values.staffEmailStatus = result.sent ? "sent" : "failed";
        if (result.sent) { values.staffSentAt = now; sent += 1; } else { errors.push(result.error || "Staff email failed."); failed += 1; }
      }
    }
    if (["pending", "failed"].includes(row.leadEmailStatus)) {
      if (!row.leadEmail) values.leadEmailStatus = "skipped";
      else {
        const result = await sendEmail({ to: row.leadEmail, subject: copy.leadSubject, text: copy.leadText, idempotencyKey: `followup-${row.id}-lead-${row.scheduledFor}` });
        values.leadEmailStatus = result.sent ? "sent" : "failed";
        if (result.sent) { values.leadSentAt = now; sent += 1; } else { errors.push(result.error || "Lead email failed."); failed += 1; }
      }
    }
    values.lastError = errors.length ? errors.join(" | ") : null;
    await db.updateFollowUpDelivery(row.id, values);
  }
  return { configured: true, due: rows.length, sent, failed };
}
