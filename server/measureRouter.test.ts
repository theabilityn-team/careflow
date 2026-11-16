import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({access:{isActive:true,isLeader:true},staff:vi.fn(),settings:vi.fn(),save:vi.fn(),target:vi.fn(),data:vi.fn(),record:vi.fn()}));
vi.mock("./permissions",()=>({getUserAccess:async()=>state.access}));
vi.mock("./measureDb",()=>({listMeasureStaff:(...a:any[])=>state.staff(...a),getMeasureSettings:(...a:any[])=>state.settings(...a),saveMeasureSettings:(...a:any[])=>state.save(...a),getMeasureStaff:(...a:any[])=>state.target(...a),getMeasureReportData:(...a:any[])=>state.data(...a)}));
vi.mock("./measureTracking",async()=>{const actual=await vi.importActual<any>("./measureTracking");return {...actual,recordClientActivity:(...a:any[])=>state.record(...a)}});
import { measureRouter } from "./routers/measure";
const caller=(role="user",imp=false)=>measureRouter.createCaller({user:{id:777,role,loginMethod:role==="admin"?"system":"local",...(imp?{impersonation:{actor:{id:30001},target:{id:777}}}:{})},req:{headers:{}},res:{}} as any);
const input={staffId:888,fromDate:"2026-11-15",toDate:"2026-11-16",bucket:"day" as const};
beforeEach(()=>{vi.clearAllMocks();state.access.isActive=true;state.access.isLeader=true;state.staff.mockResolvedValue([]);state.settings.mockResolvedValue({inactivityMinutes:40,trackingSince:1});state.save.mockResolvedValue({inactivityMinutes:55,trackingSince:1});state.target.mockResolvedValue({id:888,name:"QA Staff",email:"qa@example.invalid",isActive:true});state.data.mockResolvedValue({events:[],orders:[],trackingSince:1});state.record.mockResolvedValue({recorded:true});});
describe("Measure API roles and error boundaries",()=>{
 it("clamps earlier start dates to Nov15 and rejects entirely older reports",async()=>{await caller("admin").report({...input,fromDate:"2026-11-10"});expect(state.data).toHaveBeenCalledWith(expect.objectContaining({from:Date.parse("2026-11-15T05:00:00Z")}));state.data.mockClear();await expect(caller("admin").report({...input,fromDate:"2026-11-10",toDate:"2026-11-14"})).rejects.toMatchObject({code:"BAD_REQUEST",message:"Measure reporting starts on 2026-11-15 Eastern."});expect(state.data).not.toHaveBeenCalled();});
 it("allows active Leader and Super Admin viewers, but only Super Admin can save",async()=>{await caller().staff();await caller("admin").settings();await expect(caller().saveSettings({inactivityMinutes:55})).rejects.toMatchObject({code:"FORBIDDEN"});await caller("admin").saveSettings({inactivityMinutes:55});expect(state.save).toHaveBeenCalledOnce();expect(state.save).toHaveBeenCalledWith({inactivityMinutes:55,updatedBy:777});});
 it("denies ordinary/inactive staff before reading any private report",async()=>{state.access.isLeader=false;await expect(caller().report(input)).rejects.toMatchObject({code:"FORBIDDEN"});state.access.isLeader=true;state.access.isActive=false;await expect(caller().staff()).rejects.toMatchObject({code:"FORBIDDEN"});expect(state.data).not.toHaveBeenCalled();expect(state.staff).not.toHaveBeenCalled();});
 it("denies Measure while impersonating regardless of viewer role",async()=>{await expect(caller("admin",true).report(input)).rejects.toMatchObject({code:"FORBIDDEN"});await expect(caller("user",true).saveSettings({inactivityMinutes:55})).rejects.toMatchObject({code:"FORBIDDEN"});expect(state.target).not.toHaveBeenCalled();});
 it("rejects unknown targets and malformed/reversed/oversize ranges without source queries",async()=>{state.target.mockResolvedValue(null);await expect(caller().report(input)).rejects.toMatchObject({code:"NOT_FOUND"});await expect(caller().report({...input,fromDate:"2025-02-30",toDate:"2025-03-01"})).rejects.toMatchObject({code:"BAD_REQUEST"});await expect(caller().report({...input,fromDate:"2026-11-17"})).rejects.toMatchObject({code:"BAD_REQUEST"});await expect(caller().report({...input,toDate:"2027-11-16"})).rejects.toMatchObject({code:"BAD_REQUEST"});expect(state.data).not.toHaveBeenCalled();});
 it("uses generic internal errors and a clear bounded-query warning",async()=>{state.data.mockRejectedValue(new Error("PRIVATE_SQL_PASSWORD_CANARY"));await expect(caller().report(input)).rejects.toMatchObject({code:"INTERNAL_SERVER_ERROR",message:"Measure data could not be loaded. Please try again."});state.data.mockRejectedValue(Object.assign(new Error("PRIVATE_RAW_CANARY"),{code:"MEASURE_TOO_LARGE"}));await expect(caller().report(input)).rejects.toMatchObject({code:"BAD_REQUEST",message:"This Measure range is too large. Narrow the date range and try again."});});
 it("allows ordinary staff recording via the separate validated tracking helper, never viewer access",async()=>{state.access.isLeader=false;await caller().record({eventId:"2903c4de-fcf6-4f38-a92d-48c75d680098",kind:"navigation",page:"dashboard"});expect(state.record).toHaveBeenCalledOnce();await expect(caller().settings()).rejects.toMatchObject({code:"FORBIDDEN"});});
 it("rejects forged event fields and invalid setting thresholds",async()=>{await expect(caller().record({eventId:"2903c4de-fcf6-4f38-a92d-48c75d680098",kind:"navigation",page:"dashboard",userId:55} as any)).rejects.toMatchObject({code:"BAD_REQUEST"});for(const n of [0,241,1.5])await expect(caller("admin").saveSettings({inactivityMinutes:n})).rejects.toMatchObject({code:"BAD_REQUEST"});expect(state.record).not.toHaveBeenCalled();expect(state.save).not.toHaveBeenCalled();});
});

describe("Measure server period selection", () => {
 it("resolves Day to current Eastern today regardless of supplied old dates", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-16T18:30:00Z"));
  try {
   const r = await caller("admin").report({ ...input, period: "day", fromDate: "2026-11-15", toDate: "2026-11-30" });
   expect(r.from).toBe(Date.parse("2026-11-16T05:00:00Z"));
   expect(r.to).toBe(Date.parse("2026-11-16T18:30:00Z"));
   expect(r.bucket).toBe("hour"); expect(r.chartPoints).toHaveLength(24);
   expect(r.chartPoints.filter(p => p.observed).length).toBe(14);
  } finally { vi.useRealTimers(); }
 });
 it("uses current calendar week/month daily slots without counting future time", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-16T18:30:00Z"));
  try {
   const week = await caller("admin").report({ ...input, period: "week" });
   expect(week.bucket).toBe("day"); expect(week.chartPoints).toHaveLength(7);
   expect(week.chartPoints.filter(p => p.observed)).toHaveLength(1);
   const month = await caller("admin").report({ ...input, period: "month" });
   expect(month.from).toBe(Date.parse("2026-11-15T05:00:00Z"));
   expect(month.chartPoints).toHaveLength(16);
   expect(month.chartPoints.filter(p => p.observed)).toHaveLength(2);
   expect(month.totals.activeMinutes).toBe(0); expect(month.totals.inactiveMinutes).toBe(0);
  } finally { vi.useRealTimers(); }
 });
 it("rejects multi-day hourly charts before reading staff data", async () => {
  await expect(caller("admin").report({ ...input, period: "custom", bucket: "hour" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Hourly Measure charts require a single Eastern calendar day." });
  expect(state.target).not.toHaveBeenCalled(); expect(state.data).not.toHaveBeenCalled();
 });
});
