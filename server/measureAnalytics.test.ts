import { describe, expect, it } from "vitest";
import { calculateMeasureReport, validateMeasureRange } from "./measureAnalytics";
import type { MeasureEvent } from "../shared/measure";

const staff = { id: 7, name: "Leader", email: "leader@example.invalid", isActive: true };
const event = (id: string, at: number, type: MeasureEvent["type"], extra: Partial<MeasureEvent> = {}): MeasureEvent => ({ id, at, type, source: "tracking", sessionKey: "session-a", ...extra });

function report(events: MeasureEvent[], from: number, to: number, bucket: "day" | "week" | "month" = "day") {
  return calculateMeasureReport({
    staff,
    from,
    to,
    bucket,
    inactivityMinutes: 40,
    updatedThrough: to,
    data: { events, orders: [], trackingSince: from },
  });
}

describe("Measure analytics", () => {
  it("uses the exact inactivity boundary and caps the observed tail", () => {
    const from = Date.UTC(2025, 0, 1, 12);
    const result = report([
      event("a", from, "interaction"),
    ], from, from + 41 * 60_000);
    expect(result.totals.activeMinutes).toBe(40);
    expect(result.totals.inactiveMinutes).toBe(1);
  });

  it("merges concurrent tabs but does not bridge impersonation sessions", () => {
    const from = Date.UTC(2025, 0, 1, 12);
    const result = report([
      event("a", from, "interaction", { sessionKey: "one" }),
      event("b", from + 10 * 60_000, "interaction", { sessionKey: "two" }),
      event("c", from + 20 * 60_000, "interaction", { sessionKey: "one", impersonatedById: 99 }),
    ], from, from + 30 * 60_000);
    expect(result.totals.activeMinutes).toBe(30);
  });

  it("closes timing at explicit logout", () => {
    const from = Date.UTC(2025, 0, 1, 12);
    const result = report([
      event("a", from, "interaction"),
      event("l", from + 5 * 60_000, "logout"),
    ], from, from + 100 * 60_000);
    expect(result.totals.activeMinutes).toBe(5);
    expect(result.totals.inactiveMinutes).toBe(0);
  });

  it("requires a status change on the current lead and a different next lead for averages", () => {
    const from = Date.UTC(2025, 0, 1, 12);
    const result = report([
      event("a", from, "lead_open", { leadId: 1 }),
      event("b", from + 10 * 60_000, "status_change", { leadId: 1 }),
      event("c", from + 15 * 60_000, "lead_open", { leadId: 1 }),
      event("d", from + 20 * 60_000, "lead_open", { leadId: 2 }),
    ], from, from + 30 * 60_000);
    expect(result.totals.leadWorkSamples).toBe(1);
    expect(result.totals.averageLeadMinutes).toBe(20);
  });

  it("keeps stats deduplicated by event id and treats other_action as timing only", () => {
    const from = Date.UTC(2025, 0, 1, 12);
    const duplicate = event("same", from, "contact", { source: "audit", sessionKey: null });
    const result = report([duplicate, duplicate, event("other", from + 1, "other_action")], from, from + 10);
    expect(result.totals.contactsLogged).toBe(1);
    expect(result.totals.interactions).toBe(0);
  });

  it("creates DST-safe Monday weekly points", () => {
    const from = Date.UTC(2025, 2, 9, 15); // March 9, 2025 is the spring-forward Sunday.
    const result = report([event("a", from, "interaction")], from, from + 2 * 86_400_000, "week");
    expect(result.points[0]?.label).toBe("2025-03-03");
    expect(result.points).toHaveLength(2);
    expect(result.points[1]?.label).toBe("2025-03-10");
  });

  it("validates inclusive Eastern ranges and server-clock cutoff", () => {
    const now = Date.UTC(2025, 0, 3, 17);
    const range = validateMeasureRange("2025-01-01", "2025-01-03", now);
    expect(range.to).toBe(now);
    expect(() => validateMeasureRange("2025-01-01", "2026-01-02", now)).toThrow(/366/);
    expect(() => validateMeasureRange("2025-01-04", "2025-01-04", now)).toThrow(/future/);
  });
});

describe("Measure timing boundaries and honest history",()=>{
 const start=Date.UTC(2025,0,1,12); const min=60_000;
 it("resets inactivity on an actual event at exactly 40 minutes",()=>{const r=report([event("a",start,"interaction"),event("b",start+40*min,"navigation")],start,start+41*min);expect(r.totals.activeMinutes).toBe(41);expect(r.totals.inactiveMinutes).toBe(0);});
 it("does not count login-only presence as work",()=>{const r=report([event("login",start,"login")],start,start+90*min);expect(r.totals.logins).toBe(1);expect(r.totals.activeMinutes).toBe(0);expect(r.totals.inactiveMinutes).toBe(0);expect(r.totals.firstActivityAt).toBeNull();});
 it("subtracts other-tab activity from idle and keeps periods consistent with totals",()=>{const r=report([event("a",start,"interaction",{sessionKey:"one"}),event("b",start+60*min,"interaction",{sessionKey:"two"})],start,start+130*min);expect(r.totals.activeMinutes).toBe(80);expect(r.totals.inactiveMinutes).toBe(50);expect(r.inactivePeriods.map(p=>p.minutes)).toEqual([20,30]);expect(r.inactivePeriods[0].endedByActivity).toBe(true);expect(r.inactivePeriods[1].endedByActivity).toBe(false);});
 it("never bridges logged-out gaps between sessions",()=>{const r=report([event("a",start,"interaction",{sessionKey:"one"}),event("logout",start+10*min,"logout",{sessionKey:"one"}),event("b",start+80*min,"interaction",{sessionKey:"two"})],start,start+90*min);expect(r.totals.activeMinutes).toBe(20);expect(r.totals.inactiveMinutes).toBe(0);expect(r.inactivePeriods).toHaveLength(0);});
 it("caps an open-session tail at the actual logged login TTL",()=>{const r=report([event("login",start,"login"),event("activity",start+700*min,"interaction")],start,start+900*min);expect(r.totals.activeMinutes).toBe(20);expect(r.totals.inactiveMinutes).toBe(0);});
 it("does not fabricate historical login/navigation/timing from business audits",()=>{const r=report([event("audit",start,"status_change",{source:"audit",sessionKey:null})],start,start+60*min);expect(r.totals.statusChanges).toBe(1);expect(r.totals.activeMinutes).toBe(0);expect(r.totals.logins).toBe(0);expect(r.timingAvailable).toBe(false);expect(r.historicalEvents).toBe(1);});
 it("excludes impersonated actions and time from personal metrics",()=>{const r=report([event("a",start,"lead_open",{leadId:1,impersonatedById:99}),event("b",start+min,"status_change",{leadId:1,impersonatedById:99}),event("mail",start+2*min,"email_sent",{impersonatedById:99})],start,start+30*min);expect(r.totals.leadOpens).toBe(0);expect(r.totals.statusChanges).toBe(0);expect(r.totals.emailsSent).toBe(0);expect(r.totals.activeMinutes).toBe(0);expect(r.impersonation).toMatchObject({leadOpens:1,statusChanges:1,emailsSent:1});});
 it("uses all active resets, not a single 40-minute cap, for completed lead work",()=>{const r=report([event("open",start,"lead_open",{leadId:1}),event("status",start+30*min,"status_change",{leadId:1}),event("click",start+60*min,"interaction"),event("next",start+90*min,"lead_open",{leadId:2})],start,start+100*min);expect(r.totals.averageLeadMinutes).toBe(90);expect(r.totals.leadWorkSamples).toBe(1);});
 it("subtracts idle from lead-work average and does not create unfinished samples",()=>{const r=report([event("open",start,"lead_open",{leadId:1}),event("status",start+min,"status_change",{leadId:1}),event("next",start+80*min,"lead_open",{leadId:2})],start,start+100*min);expect(r.totals.averageLeadMinutes).toBe(41);expect(r.totals.leadWorkSamples).toBe(1);});
 it("splits both 23-hour and 25-hour Eastern DST days correctly",()=>{for(const [key,hours] of [["2025-03-09",23],["2025-11-02",25]] as const){const range=validateMeasureRange(key,key,Date.UTC(2026,0,1));const r=report([],range.from,range.to);expect(r.points).toHaveLength(1);expect(r.points[0].to-r.points[0].from+1).toBe(hours*60*min);}});
 it("keeps Monday weeks valid across month/year boundaries",()=>{const range=validateMeasureRange("2025-01-01","2025-01-01",Date.UTC(2026,0,1));expect(report([],range.from,range.to,"week").points[0].key).toBe("2024-12-30");});
 it("keeps per-currency credits and cancelled/refunded order counts separate from value",()=>{const r=calculateMeasureReport({staff,from:start,to:start+min,bucket:"day",inactivityMinutes:40,updatedThrough:start+min,data:{events:[],trackingSince:start,orders:[{id:1,at:start,ownerUserId:7,quantity:2,unitPriceCents:12345,currency:"USD",status:"completed"},{id:2,at:start,ownerUserId:7,quantity:1,unitPriceCents:999,currency:"EUR",status:"pending"},{id:3,at:start,ownerUserId:7,quantity:1,unitPriceCents:333,currency:"USD",status:"cancelled"}]}});expect(r.totals.ordersCredited).toBe(3);expect(r.totals.creditedValueByCurrency).toEqual({USD:24690,EUR:999});});
 it("rejects non-existent Eastern calendar dates",()=>{expect(()=>validateMeasureRange("2025-02-30","2025-03-01",Date.UTC(2026,0,1))).toThrow();});
});
