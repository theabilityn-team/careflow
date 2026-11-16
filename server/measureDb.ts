import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  auditEvents,
  localCredentials,
  measureSettings,
  outboundEmails,
  salesOrders,
  staffActivityEvents,
  staffPermissions,
  users,
} from "../drizzle/schema";
import { SYSTEM_ADMIN_ACTOR_ID } from "../shared/const";
import type { MeasureEvent, MeasureSettings, MeasureStaff } from "../shared/measure";
import { getDb } from "./db";
import { normalizePermissions } from "../shared/permissions";
import type { MeasureOrder, MeasureReportData } from "./measureAnalytics";

export const MEASURE_SETTINGS_ID = 1;
export const MEASURE_QUERY_LIMIT = 50_001;
export const DEFAULT_INACTIVITY_MINUTES = 40;

function requireDatabase<T>(value: T | null | undefined): T {
  if (!value) throw new Error("Database is not available");
  return value;
}

function safeDisplayName(name: string | null, email: string | null, id: number) {
  return name?.trim() || email?.trim() || `Staff #${id}`;
}

function safeJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function actualAuditChange(event: { changes: string | null }) {
  const changes = safeJson(event.changes);
  return Array.isArray(changes) && changes.length > 0;
}

function hasBusinessChange(event: { changes: string | null; action: string }) {
  if (actualAuditChange(event)) return true;
  return event.action === "communication.logged" || event.action === "follow_up.completed";
}

function sourceIsExcluded(source: string) {
  const value = source.toLowerCase();
  return value.includes("system") || value.includes("backfill") || value.includes("import") || value.includes("automatic");
}

function eventSourceId(prefix: string, id: number) {
  return `${prefix}:${id}`;
}

export function auditToMeasureEvent(row: {
  id: number;
  actorId: number;
  impersonatedById: number | null;
  action: string;
  source: string;
  detail: string | null;
  changes: string | null;
  leadId: number | null;
  occurredAt: number;
}, userId: number): MeasureEvent | null {
  if (row.actorId !== userId || row.actorId === SYSTEM_ADMIN_ACTOR_ID || sourceIsExcluded(row.source)) return null;
  const common = { id: eventSourceId("audit", row.id), at: row.occurredAt, leadId: row.leadId, impersonatedById: row.impersonatedById, source: "audit" as const };
  const changes = safeJson(row.changes);
  const statusChanged = Array.isArray(changes) && changes.some((change: any) => change.field === "status" && change.before !== change.after);
  if ((row.action === "lead.status_changed" || row.action === "lead.updated") && statusChanged) return { ...common, type: "status_change" };
  if ((row.action === "communication.logged" || row.action === "follow_up.completed") && hasBusinessChange(row)) {
    const method = row.detail?.split(":", 1)[0]?.trim().toLowerCase();
    return { ...common, type: method === "phone" ? "phone_contact" : "contact" };
  }
  if (row.action === "order.created") return { ...common, type: "order_entered" };
  if ((row.action === "lead.updated" || row.action === "lead.interest_changed") && actualAuditChange(row)) return { ...common, type: "other_action" };
  if (row.action.startsWith("lead.") || row.action.startsWith("communication.") || row.action.startsWith("follow_up.")) return null;
  return { ...common, type: "other_action" };
}

function mapTrackingEvent(row: typeof staffActivityEvents.$inferSelect): MeasureEvent {
  const type = row.kind as MeasureEvent["type"];
  return {
    id: eventSourceId("tracking", row.id),
    at: row.occurredAt,
    type,
    leadId: row.leadId,
    sessionKey: row.sessionKey,
    impersonatedById: row.impersonatedById,
    source: "tracking",
  };
}

function throwTooLarge(source: string) {
  throw Object.assign(new Error(`Measure ${source} result exceeded the supported limit.`), { code: "MEASURE_TOO_LARGE" });
}

export async function listMeasureStaff(): Promise<MeasureStaff[]> {
  const db = requireDatabase(await getDb());
  const rows = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    isActive: staffPermissions.isActive,
    deletedAt: staffPermissions.deletedAt,
    permissions: staffPermissions.permissions,
  }).from(users)
    .innerJoin(localCredentials, eq(localCredentials.userId, users.id))
    .innerJoin(staffPermissions, eq(staffPermissions.userId, users.id))
    .where(and(eq(users.role, "user"), sql`${staffPermissions.deletedAt} is null`))
    .orderBy(desc(staffPermissions.isActive), asc(users.name), asc(users.id));
  return rows.map(row => {
    let permissions: unknown = {};
    try { permissions = JSON.parse(row.permissions); } catch { /* Invalid permissions are not leader access. */ }
    return {
      id: row.id,
      name: safeDisplayName(row.name, row.email, row.id),
      email: row.email,
      isActive: Boolean(row.isActive),
      isLeader: Boolean(row.isActive && normalizePermissions(permissions).manageSales),
    };
  });
}

export async function getMeasureStaff(staffId: number) {
  const staff = await listMeasureStaff();
  return staff.find(item => item.id === staffId) ?? null;
}

async function ensureSettingsRow() {
  const db = requireDatabase(await getDb());
  const existing = (await db.select().from(measureSettings).where(eq(measureSettings.id, MEASURE_SETTINGS_ID)).limit(1))[0];
  if (existing) return existing;
  const now = Date.now();
  try {
    await db.insert(measureSettings).values({ id: MEASURE_SETTINGS_ID, inactivityMinutes: DEFAULT_INACTIVITY_MINUTES, trackingSince: now, updatedBy: null, updatedAt: now });
  } catch {
    // Concurrent first read: the other request owns the singleton.
  }
  const saved = (await db.select().from(measureSettings).where(eq(measureSettings.id, MEASURE_SETTINGS_ID)).limit(1))[0];
  if (!saved) throw new Error("Measure settings could not be initialized.");
  return saved;
}

export async function getMeasureSettings(): Promise<MeasureSettings> {
  const row = await ensureSettingsRow();
  return { inactivityMinutes: row.inactivityMinutes || DEFAULT_INACTIVITY_MINUTES, trackingSince: row.trackingSince };
}

export async function saveMeasureSettings(input: { inactivityMinutes: number; updatedBy: number }): Promise<MeasureSettings> {
  if (!Number.isInteger(input.inactivityMinutes) || input.inactivityMinutes < 1 || input.inactivityMinutes > 240) throw new RangeError("Inactivity minutes must be between 1 and 240.");
  const db = requireDatabase(await getDb());
  await ensureSettingsRow();
  return db.transaction(async tx => {
    const [current] = await tx.select().from(measureSettings).where(eq(measureSettings.id,MEASURE_SETTINGS_ID)).limit(1).for("update");
    if(!current)throw new Error("Measure settings unavailable");
    if(current.inactivityMinutes !== input.inactivityMinutes) {
      const now=Date.now();
      await tx.update(measureSettings).set({inactivityMinutes:input.inactivityMinutes,updatedBy:input.updatedBy,updatedAt:now}).where(eq(measureSettings.id,MEASURE_SETTINGS_ID));
      await tx.insert(auditEvents).values({leadId:null,actorId:input.updatedBy,action:"measure.settings_updated",source:"measure",detail:"Measure inactivity threshold updated",changes:JSON.stringify([{field:"inactivityMinutes",before:current.inactivityMinutes,after:input.inactivityMinutes}]),occurredAt:now});
    }
    return {inactivityMinutes:input.inactivityMinutes,trackingSince:current.trackingSince};
  });
}

async function readBounded<T>(query: Promise<T[]>, source: string) {
  const rows = await query;
  if (rows.length >= MEASURE_QUERY_LIMIT) throwTooLarge(source);
  return rows;
}

export async function getMeasureReportData(input: { staffId: number; from: number; to: number; updatedThrough: number }): Promise<MeasureReportData> {
  const db = requireDatabase(await getDb());
  const timingFrom = Math.max(0, input.from - 12 * 60 * 60 * 1000);
  const [trackingRows, auditRows, emailRows, orderRows, settings] = await Promise.all([
    readBounded(db.select().from(staffActivityEvents).where(and(eq(staffActivityEvents.userId, input.staffId), gte(staffActivityEvents.occurredAt, timingFrom), lte(staffActivityEvents.occurredAt, input.to))).orderBy(asc(staffActivityEvents.occurredAt), asc(staffActivityEvents.id)).limit(MEASURE_QUERY_LIMIT), "activity events"),
    readBounded(db.select({ id: auditEvents.id, actorId: auditEvents.actorId, impersonatedById: auditEvents.impersonatedById, action: auditEvents.action, source: auditEvents.source, detail: auditEvents.detail, changes: auditEvents.changes, leadId: auditEvents.leadId, occurredAt: auditEvents.occurredAt }).from(auditEvents).where(and(eq(auditEvents.actorId, input.staffId), gte(auditEvents.occurredAt, timingFrom), lte(auditEvents.occurredAt, input.to))).orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id)).limit(MEASURE_QUERY_LIMIT), "audit events"),
    readBounded(db.select({ id: outboundEmails.id, senderUserId: outboundEmails.senderUserId, impersonatedById: outboundEmails.impersonatedById, status: outboundEmails.status, leadId: outboundEmails.leadId, sentAt: outboundEmails.sentAt }).from(outboundEmails).where(and(eq(outboundEmails.senderUserId, input.staffId), eq(outboundEmails.status, "sent"), gte(outboundEmails.sentAt, input.from), lte(outboundEmails.sentAt, input.to))).orderBy(asc(outboundEmails.sentAt), asc(outboundEmails.id)).limit(MEASURE_QUERY_LIMIT), "outbound emails"),
    readBounded(db.select({ id: salesOrders.id, ownerUserId: salesOrders.ownerUserId, quantity: salesOrders.quantity, unitPriceCents: salesOrders.unitPriceCents, currency: salesOrders.currency, status: salesOrders.status, orderedAt: salesOrders.orderedAt }).from(salesOrders).where(and(eq(salesOrders.ownerUserId, input.staffId), gte(salesOrders.orderedAt, input.from), lte(salesOrders.orderedAt, input.to))).orderBy(asc(salesOrders.orderedAt), asc(salesOrders.id)).limit(MEASURE_QUERY_LIMIT), "credited orders"),
    getMeasureSettings(),
  ]);
  const events: MeasureEvent[] = [];
  for (const row of trackingRows) events.push(mapTrackingEvent(row));
  for (const row of auditRows) {
    const event = auditToMeasureEvent(row, input.staffId);
    if (event) events.push(event);
  }
  for (const row of emailRows) {
    // Reminder deliveries are not inserted into outboundEmails; a legitimate manually-authored subject beginning with “Reminder” still counts.
    events.push({ id: eventSourceId("mail", row.id), at: row.sentAt, type: "email_sent", leadId: row.leadId, impersonatedById: row.impersonatedById, source: "mail" });
  }
  // Match canonical audited writes to a uniquely evidenced same-operator runtime
  // mutation. Historical records never infer a session from sparse activity.
  for (const event of events) {
    if (event.source === "tracking" || settings.trackingSince === null || event.at < settings.trackingSince) continue;
    const candidates = trackingRows.filter(row => row.kind === "other_action" && row.impersonatedById === (event.impersonatedById ?? null) && row.occurredAt >= event.at && row.occurredAt - event.at <= 5_000);
    const sessions = Array.from(new Set(candidates.map(row => row.sessionKey)));
    if (sessions.length === 1) event.sessionKey = sessions[0];
  }
  const unique = new Map<string, MeasureEvent>();
  for (const event of events) unique.set(event.id, event);
  const orders: MeasureOrder[] = orderRows.map(row => ({ id: row.id, at: row.orderedAt, ownerUserId: row.ownerUserId, quantity: Number(row.quantity), unitPriceCents: Number(row.unitPriceCents), currency: row.currency, status: row.status }));
  return { events: Array.from(unique.values()).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)), orders, trackingSince: settings.trackingSince };
}
