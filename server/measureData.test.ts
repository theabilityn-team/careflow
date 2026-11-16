import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
const mocks = vi.hoisted(() => ({ rows: {} as Record<string, any[]>, selections: [] as any[] }));
vi.mock("./db", () => ({ getDb: async () => ({ select: (fields: any) => ({ from: (table: any) => {
  const name = getTableName(table); mocks.selections.push({ table: name, fields: fields ? Object.keys(fields) : null });
  const query: any = { where: () => query, orderBy: () => query, limit: async () => mocks.rows[name] ?? [] }; return query;
} }) }) }));
import { getMeasureReportData } from "./measureDb";
import { MEASURE_REPORTING_START_MS } from "../shared/measure";
const at = Date.UTC(2026, 10, 16, 12);
const input = { staffId: 7, from: at, to: at + 120 * 60_000, updatedThrough: at + 120 * 60_000 };
beforeEach(() => {
  mocks.rows = { measure_settings: [{ id: 1, inactivityMinutes: 40, trackingSince: at + 1000 }], staff_activity_events: [], audit_events: [], outbound_emails: [], auth_sessions: [{ tokenHash: "PRIVATE_TOKEN", id: 123, startedAt: new Date(at), expiresAt: at + 60_000 }] };
  mocks.selections = [];
});
describe("Measure activity-only data", () => {
  it("does not read authentication boundaries or fabricate a login", async () => {
    const data = await getMeasureReportData(input);
    expect(data.events).toEqual([]);
    expect(mocks.selections.some(x => x.table === "auth_sessions")).toBe(false);
    expect(data.reportingSince).toBe(MEASURE_REPORTING_START_MS);
    expect(data.trackingSince).toBe(at + 1000);
    expect(JSON.stringify(data)).not.toContain("PRIVATE_TOKEN");
  });
  it("excludes existing login/logout captures but keeps a real lead open", async () => {
    mocks.rows.staff_activity_events = ["login", "lead_open", "logout"].map((kind, i) => ({ id: i + 1, userId: 7, kind, sessionKey: "same", occurredAt: at + i, leadId: kind === "lead_open" ? 8 : null, impersonatedById: null }));
    const data = await getMeasureReportData(input);
    expect(data.events.map(x => x.type)).toEqual(["lead_open"]);
    expect(data.events[0].leadId).toBe(8);
  });
  it("keeps real statuses and contacts without requiring session evidence or leaking notes", async () => {
    mocks.rows.audit_events = [
      { id: 1, actorId: 7, impersonatedById: null, action: "lead.updated", source: "manual", leadId: 8, occurredAt: at, detail: "PRIVATE_CLINICAL_DETAIL", changes: JSON.stringify([{ field: "status", before: "new", after: "contacted" }]) },
      { id: 2, actorId: 7, impersonatedById: null, action: "communication.logged", source: "manual", leadId: 8, occurredAt: at + 100 * 60_000, detail: "phone: PRIVATE_CONTACT_OUTCOME", changes: "[]" },
    ];
    const data = await getMeasureReportData(input);
    expect(data.events.map(x => x.type)).toEqual(["status_change", "phone_contact"]);
    expect(data.events.every(x => x.sessionKey == null)).toBe(true);
    expect(JSON.stringify(data)).not.toContain("PRIVATE_");
  });
  it("reads successful outbound timestamps and lead links, never subjects or recipients", async () => {
    mocks.rows.outbound_emails = [{ id: 1, senderUserId: 7, impersonatedById: null, status: "sent", leadId: 8, sentAt: at, subject: "PRIVATE_SUBJECT", recipientEmail: "PRIVATE_EMAIL" }];
    const data = await getMeasureReportData(input);
    expect(data.events).toEqual([expect.objectContaining({ type: "email_sent", at, leadId: 8, source: "mail" })]);
    expect(mocks.selections.find(x => x.table === "outbound_emails").fields).not.toContain("subject");
    expect(JSON.stringify(data)).not.toContain("PRIVATE_");
  });
  it("deduplicates source IDs and excludes automated import activity", async () => {
    const row = { id: 5, userId: 7, kind: "navigation", sessionKey: "one", occurredAt: at, impersonatedById: null };
    mocks.rows.staff_activity_events = [row, row];
    mocks.rows.audit_events = [{ id: 1, actorId: 7, impersonatedById: null, action: "lead.created", source: "direct_import", leadId: 8, occurredAt: at, detail: null, changes: "[]" }];
    const data = await getMeasureReportData(input);
    expect(data.events).toHaveLength(1);
    expect(data.events[0].type).toBe("navigation");
  });
});
