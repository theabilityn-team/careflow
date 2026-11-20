import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";
import { SYSTEM_ADMIN_ACTOR_ID } from "../shared/const";
import { PERMISSION_KEYS } from "../shared/permissions";
import { normalizeLeadFields } from "../shared/leadFieldPermissions";
import { allLeadInformationEditable, assertLeadPatchEditable, LeadFieldAccessError, LeadFieldInputError, mergeAdditionalInformation, redactLeadAuditEvents, redactLeadFields } from "./leadFieldAccess";
import { exportRowValues } from "./leadExport";
const now = new Date("2026-11-20T12:00:00Z");
const user = { id: 17, openId: "test-staff", name: "Fixture Staff", email: "fixture@example.com", loginMethod: "local", role: "user" as const, createdAt: now, updatedAt: now, lastSignedIn: now };
const admin = { ...user, id: SYSTEM_ADMIN_ACTOR_ID, role: "admin" as const };
const flags = Object.fromEntries(PERMISSION_KEYS.map(key => [key, key !== "manageSales"]));
const fields = normalizeLeadFields(undefined);
const access = { role: "technical_staff", isActive: true, permissions: flags, leadFields: fields };
function context(actor: typeof user | typeof admin = user): TrpcContext { return { user: actor, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] }; }
function fixtureSettings(leadFields: unknown = fields, extra: Record<string, boolean> = {}) { return { userId: 17, isActive: true, jobTitle: "Fixture", preferredLanguage: "en" as const, permissions: JSON.stringify({ ...flags, ...extra, leadFields }), createdAt: now, updatedAt: now }; }
const row = (label: string, value: string, section = "Vitals") => ({ section, label, value });
afterEach(() => vi.restoreAllMocks());
describe("core field data protection", () => {
  it("preserves hidden, view-only AND omitted editable rows during a changed-only patch", () => {
    const before = [row("Height", "170"), row("Weight", "60"), row("BSA", "PRIVATE_BSA"), row("Sex", "VIEW_ONLY", "Patient")];
    const restricted = { ...access, leadFields: { ...fields, "vitals.bsa": "hide", "patient.sex": "view" } };
    const merged = JSON.parse(mergeAdditionalInformation(JSON.stringify(before), JSON.stringify([{ ...row("Height", "171"), _occurrence: 0 }]), restricted)!);
    expect(merged).toEqual([{ ...before[0], value: "171" }, ...before.slice(1)]);
    expect(before[0].value).toBe("170");
  });
  it("targets one repeated label occurrence, keeps immutable row metadata and strips patch metadata", () => {
    const before = [{ ...row("Height", "170"), confidence: 0.8 }, row("Height", "171")];
    const patch = [{ ...row("Height", "172"), _occurrence: 1, confidence: 0, metadata: "UNTRUSTED" }];
    assertLeadPatchEditable({ additionalInformation: JSON.stringify(patch) }, access);
    const after = JSON.parse(mergeAdditionalInformation(JSON.stringify(before), JSON.stringify(patch), access)!);
    expect(after).toEqual([before[0], { ...before[1], value: "172" }]);
    expect(JSON.stringify(after)).not.toContain("_occurrence");
    expect(JSON.stringify(after)).not.toContain("UNTRUSTED");
  });
  it("rejects ambiguous, out-of-range, invalid and repeated occurrence references", () => {
    const before = JSON.stringify([row("Height", "170"), row("Height", "171")]);
    for (const patch of [[row("Height", "172")], [{ ...row("Height", "172"), _occurrence: 2 }], [{ ...row("Height", "172"), _occurrence: -1 }], [{ ...row("Height", "172"), _occurrence: 0 }, { ...row("Height", "173"), _occurrence: 0 }]]) expect(() => mergeAdditionalInformation(before, JSON.stringify(patch), access)).toThrow(LeadFieldInputError);
  });
  it("clears only the explicit editable row; null or omitted patches preserve unrelated data", () => {
    const before = JSON.stringify([row("Height", "170"), row("Weight", "60")]);
    expect(JSON.parse(mergeAdditionalInformation(before, JSON.stringify([row("Height", "")]), access)!)).toEqual([row("Weight", "60")]);
    expect(mergeAdditionalInformation(before, null, access)).toBe(before);
    expect(mergeAdditionalInformation(before, undefined, access)).toBe(before);
  });
  it("rejects crafted writes to hidden/read-only values, including null", () => {
    const restricted = { ...access, leadFields: { ...fields, email: "view", diagnosis: "hide" } };
    for (const patch of [{ email: "changed@example.com" }, { email: null }, { diagnosis: null }, { diagnosis: "Changed" }, { lastContactAt: 123 }]) expect(() => assertLeadPatchEditable(patch, restricted)).toThrow(LeadFieldAccessError);
  });
  it("authorizes manual new rows but rejects denied rows and creation occurrence references", () => {
    const restricted = { ...access, leadFields: { ...fields, "patient.sex": "hide" } };
    expect(() => assertLeadPatchEditable({ additionalInformation: JSON.stringify([row("Sex", "x", "Patient")]) }, restricted, { allowRowOccurrences: false })).toThrow(LeadFieldAccessError);
    expect(() => assertLeadPatchEditable({ additionalInformation: JSON.stringify([{ ...row("Height", "170"), _occurrence: 0 }]) }, access, { allowRowOccurrences: false })).toThrow(LeadFieldInputError);
    expect(() => assertLeadPatchEditable({ additionalInformation: JSON.stringify([row("Height", "170")]) }, access, { allowRowOccurrences: false })).not.toThrow();
  });
  it("rejects malformed structured section data and excludes automatic fields from all-editable", () => {
    expect(() => mergeAdditionalInformation(null, JSON.stringify([{ label: "Height", value: "170", section: {} }]), access)).toThrow(LeadFieldInputError);
    expect(allLeadInformationEditable(access)).toBe(true);
    expect(allLeadInformationEditable({ ...access, leadFields: { ...fields, email: "view" } })).toBe(false);
  });
  it("removes hidden field changes and redacts additional-information before/after and snapshots", () => {
    const restricted = { ...access, leadFields: { ...fields, diagnosis: "hide", "vitals.bsa": "hide" } };
    const additional = JSON.stringify([row("Height", "170"), row("BSA", "PRIVATE_BSA"), row("Unknown note", "PRIVATE_UNKNOWN")]);
    const events = [{ id: 1, actorName: "Staff", occurredAt: 1, detail: "PRIVATE_DETAIL", changes: [{ field: "diagnosis", before: "PRIVATE_BEFORE", after: "PRIVATE_AFTER" }, { field: "additionalInformation", before: additional, after: additional }, { field: "email", before: "old@example.com", after: "new@example.com" }], snapshotAfter: { diagnosis: "PRIVATE_SNAPSHOT", additionalInformation: additional, city: "Visible city" } }];
    const safe = redactLeadAuditEvents(events, restricted);
    expect(JSON.stringify(safe)).not.toContain("PRIVATE_");
    expect(safe[0].changes.map(change => change.field)).toEqual(["additionalInformation", "email"]);
    expect(safe[0].snapshotAfter.city).toBe("Visible city");
    expect(safe[0].actorName).toBe("Staff");
    expect(events[0].detail).toBe("PRIVATE_DETAIL");
  });
  it("redacts contact aliases, identity hashes and unknown extracted metadata", () => {
    const safe = redactLeadFields({ email: "PRIVATE_EMAIL", leadEmail: "PRIVATE_ALIAS", identityHash: "PRIVATE_HASH", additionalInformation: JSON.stringify([{ ...row("Height", "170"), metadata: "PRIVATE_METADATA" }, row("Unknown note", "PRIVATE_NOTE")]) }, { ...access, leadFields: { ...fields, email: "hide" } });
    expect(JSON.stringify(safe)).not.toContain("PRIVATE_");
    expect(safe.additionalInformation).toContain("170");
  });
  it("does not invent English or undefined status labels for hidden export fields", () => {
    const values = exportRowValues({ id: 1, firstName: "", lastName: "", preferredLanguage: null, status: null, interestLevel: null, assignedStaff: "", createdAt: now, updatedAt: now } as any);
    expect(values[3]).toBe(""); expect(values[12]).toBe(""); expect(values[13]).toBe(""); expect(values[14]).toBe("");
  });
});
describe("mocked field access API boundaries", () => {
  beforeEach(() => { vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(fixtureSettings()); });
  it.each(["hide", "view"])("rejects a %s email write before invoking any DB update", async mode => {
    vi.mocked(db.getStaffPermissionRecord).mockResolvedValue(fixtureSettings({ ...fields, email: mode }));
    vi.spyOn(db, "canAccessLead").mockResolvedValue(true);
    const update = vi.spyOn(db, "updateLeadWithAudit").mockResolvedValue(null);
    await expect(appRouter.createCaller(context()).leads.update({ id: 44, lead: { email: null } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(update).not.toHaveBeenCalled();
  });
  it("passes changed-only editable rows to the transactional merge without rejecting valid occurrence", async () => {
    vi.spyOn(db, "canAccessLead").mockResolvedValue(true);
    const update = vi.spyOn(db, "updateLeadWithAudit").mockResolvedValue({ changes: [] } as any);
    const patch = JSON.stringify([{ ...row("Height", "171"), _occurrence: 0 }]);
    await expect(appRouter.createCaller(context()).leads.update({ id: 44, lead: { additionalInformation: patch } })).resolves.toMatchObject({ success: true });
    expect(update).toHaveBeenCalledWith(44, { additionalInformation: patch }, expect.anything(), expect.objectContaining({ leadFields: fields }));
  });
  it("rejects hidden duplicate identity probes before querying existing people", async () => {
    vi.mocked(db.getStaffPermissionRecord).mockResolvedValue(fixtureSettings({ ...fields, dateOfBirth: "hide" }));
    const find = vi.spyOn(db, "findDuplicateLead").mockResolvedValue(null);
    await expect(appRouter.createCaller(context()).leads.duplicateCheck({ firstName: "Alex", lastName: "Doe", dateOfBirth: "1980-01-01" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(find).not.toHaveBeenCalled();
  });
  it("rejects completion of a view-only follow-up even without a replacement date", async () => {
    vi.mocked(db.getStaffPermissionRecord).mockResolvedValue(fixtureSettings({ ...fields, nextFollowUpAt: "view" }));
    const write = vi.spyOn(db, "addCommunicationWithAudit").mockResolvedValue({} as any);
    await expect(appRouter.createCaller(context()).leads.addCommunication({ leadId: 44, followUpId: 8, completeFollowUp: true, method: "phone", direction: "outbound", outcome: "Done", contactedAt: 123 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(write).not.toHaveBeenCalled();
  });
  it("returns redacted detail, source links and communication history with hidden fields", async () => {
    vi.mocked(db.getStaffPermissionRecord).mockResolvedValue(fixtureSettings({ ...fields, diagnosis: "hide", nextFollowUpAt: "hide" }));
    const fixture = { lead: { id: 44, firstName: "Alex", diagnosis: "PRIVATE_DIAG", nextFollowUpAt: 123 }, documents: [{ fileUrl: "PRIVATE_URL" }], communications: [{ outcome: "PRIVATE_OUTCOME", notes: "PRIVATE_NOTES", nextFollowUpAt: 123 }], followUps: [{ id: 8, scheduledFor: 123 }], auditEvents: [] };
    vi.spyOn(db, "getLead").mockResolvedValue(fixture as any);
    const safe = await appRouter.createCaller(context()).leads.get({ id: 44 });
    expect(JSON.stringify(safe)).not.toContain("PRIVATE_"); expect(safe.followUps).toEqual([]); expect(safe.lead.firstName).toBe("Alex");
    expect(fixture.documents).toHaveLength(1);
  });
  it("Super Admin retains original detail and email communication text", async () => {
    const fixture = { lead: { id: 44, diagnosis: "Authorized clinical information" }, documents: [{ fileUrl: "source" }], communications: [{ method: "email", outcome: "Visible subject", notes: "Visible email text" }], followUps: [], auditEvents: [] };
    vi.spyOn(db, "getLead").mockResolvedValue(fixture as any);
    const safe = await appRouter.createCaller(context(admin)).leads.get({ id: 44 });
    expect(safe.documents).toHaveLength(1); expect(safe.communications[0].notes).toBe("Visible email text");
    expect(db.getStaffPermissionRecord).not.toHaveBeenCalled();
  });
  it("ordinary staff cannot list or update permission recipients", async () => {
    const list = vi.spyOn(db, "listLeadFieldStaff").mockResolvedValue([]);
    const write = vi.spyOn(db, "updateStaffLeadFields").mockResolvedValue({ kind: "not_found" } as any);
    await expect(appRouter.createCaller(context()).staff.leadFieldStaff()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context()).staff.updateLeadFields({ userId: 18, leadFields: { email: "hide" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(list).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });
  it("Leader directory excludes self and other Leaders, including inactive Leaders; Admin includes them", async () => {
    vi.mocked(db.getStaffPermissionRecord).mockResolvedValue(fixtureSettings(fields, { manageSales: true }));
    vi.spyOn(db, "listLeadFieldStaff").mockResolvedValue([
      { id: 17, permissions: JSON.stringify({ manageSales: true }), isActive: true },
      { id: 18, permissions: JSON.stringify({ manageSales: false, leadFields: { email: "hide" } }), isActive: true },
      { id: 19, permissions: JSON.stringify({ manageSales: true }), isActive: false },
    ] as any);
    const leader = await appRouter.createCaller(context()).staff.leadFieldStaff();
    expect(leader.map(member => member.id)).toEqual([18]); expect(leader[0].leadFields.email).toBe("hide");
    expect((await appRouter.createCaller(context(admin)).staff.leadFieldStaff()).map(member => member.id)).toEqual([17, 18, 19]);
  });
  it("saves only the requested field delta and confirms the complete normalized map", async () => {
    const write = vi.spyOn(db, "updateStaffLeadFields").mockResolvedValue({ kind: "updated", target: {}, leadFields: { ...fields, email: "hide", phone: "view" } } as any);
    const result = await appRouter.createCaller(context(admin)).staff.updateLeadFields({ userId: 18, leadFields: { email: "hide" } });
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ leadFields: { email: "hide" }, actorIsSuperAdmin: true }));
    expect(result.leadFields.phone).toBe("view"); expect(Object.keys(result.leadFields)).toEqual(Object.keys(fields));
  });
  it("invalid field/mode payloads never reach the write and corrupted saved maps remain conflicts", async () => {
    const write = vi.spyOn(db, "updateStaffLeadFields").mockResolvedValue({ kind: "conflict" } as any);
    for (const leadFields of [{ unknownKey: "hide" }, { email: "invalid" }]) await expect(appRouter.createCaller(context(admin)).staff.updateLeadFields({ userId: 18, leadFields } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(write).not.toHaveBeenCalled();
    await expect(appRouter.createCaller(context(admin)).staff.updateLeadFields({ userId: 18, leadFields: { email: "hide" } })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("hidden follow-up dates cannot be probed through queues, arbitrary calendar ranges or notifications", async () => {
    vi.mocked(db.getStaffPermissionRecord).mockResolvedValue(fixtureSettings({ ...fields, nextFollowUpAt: "hide" }));
    const upcoming = vi.spyOn(db, "getUpcomingFollowUps").mockResolvedValue([]);
    const calendar = vi.spyOn(db, "getFollowUpCalendar").mockResolvedValue([]);
    const notices = vi.spyOn(db, "listFollowUpNotifications").mockResolvedValue([]);
    const caller = appRouter.createCaller(context());
    expect(await caller.dashboard.followUps()).toEqual([]); expect(await caller.dashboard.followUpCalendar({ from: 1, to: 200 })).toEqual([]); expect(await caller.dashboard.notifications()).toEqual([]);
    expect(upcoming).not.toHaveBeenCalled(); expect(calendar).not.toHaveBeenCalled(); expect(notices).not.toHaveBeenCalled();
  });
  it("rejects hidden-field list filters and archive free-text search before DB query", async () => {
    vi.mocked(db.getStaffPermissionRecord).mockResolvedValue(fixtureSettings({ ...fields, status: "hide" }));
    const list = vi.spyOn(db, "listLeads").mockResolvedValue({ items: [] } as any);
    const archive = vi.spyOn(db, "getCompletedFollowUps").mockResolvedValue({ items: [] } as any);
    await expect(appRouter.createCaller(context()).leads.list({ status: "new" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context()).dashboard.followUpArchive({ search: "private" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(list).not.toHaveBeenCalled(); expect(archive).not.toHaveBeenCalled();
  });
  it("dashboard totals do not reveal hidden status, interest or follow-up breakdowns", async () => {
    vi.mocked(db.getStaffPermissionRecord).mockResolvedValue(fixtureSettings({ ...fields, status: "hide", interestLevel: "hide", nextFollowUpAt: "hide" }));
    vi.spyOn(db, "getDashboardSummary").mockResolvedValue({ total: 1, buyers: 1, hot: 1, followUps: 1, recent: [] });
    expect(await appRouter.createCaller(context()).dashboard.summary()).toMatchObject({ total: 1, buyers: 0, hot: 0, followUps: 0 });
  });

});
