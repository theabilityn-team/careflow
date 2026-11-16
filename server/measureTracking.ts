import { createHash, randomUUID } from "node:crypto";
import { parse } from "cookie";
import { and, desc, eq, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "../shared/const";
import { measureSettings, staffActivityEvents } from "../drizzle/schema";
import { canAccessLead, getAuthSession, getDb, getUserById } from "./db";
import { getUserAccess } from "./permissions";
import type { TrpcContext } from "./_core/context";
import type { PermissionKey } from "../shared/permissions";

export const MEASURE_PAGES = ["dashboard", "leads", "lead", "groups", "scan", "bulk-import", "follow-ups", "mails", "customers", "orders", "email-templates", "guide", "staff", "measure"] as const;
export const clientActivityInput = z.object({
  eventId: z.string().uuid(), kind: z.enum(["navigation", "interaction", "lead_open"]),
  page: z.enum(MEASURE_PAGES), leadId: z.number().int().positive().optional(),
}).strict().superRefine((v,c) => {
  if ((v.kind === "lead_open" || v.page === "lead") && (!v.leadId || v.page !== "lead")) c.addIssue({code:"custom",message:"A lead activity requires the exact lead page and lead ID."});
  if (v.page !== "lead" && v.leadId) c.addIssue({code:"custom",message:"Lead IDs are accepted only on the lead page."});
});
export type ClientActivityInput = z.infer<typeof clientActivityInput>;
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
export function activitySessionKey(token: string, userId: number, operatorId = 0) {
  // Domain-separated digest cannot be replayed as the authentication-session hash.
  return digest(`careflow-measure-v1:${userId}:${operatorId}:${token}`);
}
async function activityDb() { const db=await getDb(); if(!db) throw Error("Measure storage unavailable");return db; }
async function insertEvent(event: typeof staffActivityEvents.$inferInsert) {
  const db=await activityDb();const now=Date.now();
  await db.insert(measureSettings).values({id:1,inactivityMinutes:40,trackingSince:now,updatedAt:now}).onDuplicateKeyUpdate({set:{id:1}});
  await db.insert(staffActivityEvents).values(event).onDuplicateKeyUpdate({set:{eventKey:event.eventKey}});
}
/** A retained authenticated session supplies its real start; never use a browser timestamp. */
async function ensureSessionStart(userId: number, token: string) {
  const record = await getAuthSession(digest(token));
  if (!record || record.session.userId !== userId || record.session.expiresAt <= Date.now()) return;
  const at = new Date(record.session.createdAt).getTime();
  if (!Number.isFinite(at) || at > Date.now() || at >= record.session.expiresAt) return;
  const sessionKey = activitySessionKey(token, userId);
  await insertEvent({ eventKey: digest(`${sessionKey}:login`), userId, sessionKey, kind: "login", occurredAt: at });
}
const PAGE_PERMISSION: Partial<Record<typeof MEASURE_PAGES[number],PermissionKey>> = {
  leads:"viewLeads",lead:"viewLeads",groups:"viewLeads",scan:"scanDocuments","bulk-import":"scanDocuments","follow-ups":"viewLeads",mails:"manageEmails","email-templates":"useEmailTemplates",
};
export async function recordClientActivity(ctx: TrpcContext, input: ClientActivityInput) {
  if(!ctx.user || ctx.user.role!=="user" || ctx.user.loginMethod!=="local") throw new TRPCError({code:"FORBIDDEN",message:"Staff activity requires an active local staff account."});
  const access=await getUserAccess(ctx.user);
  if(!access.isActive) throw new TRPCError({code:"FORBIDDEN",message:"Your staff account is inactive."});
  const permission=PAGE_PERMISSION[input.page];
  if(permission&&!access.permissions[permission] || (input.page==="scan"||input.page==="bulk-import")&&!access.permissions.viewClinical || input.page==="email-templates"&&!access.permissions.manageEmails || (input.page==="staff"||input.page==="measure")&&(!access.isLeader||Boolean(ctx.user.impersonation))) throw new TRPCError({code:"FORBIDDEN",message:"This activity page is not available to your account."});
  if(input.page==="lead"&&!await canAccessLead(input.leadId!,ctx.user.id,access.isLeader)) throw new TRPCError({code:"NOT_FOUND",message:"Lead not found."});
  const token=parse(ctx.req.headers.cookie??"")[COOKIE_NAME];
  if(!token) throw new TRPCError({code:"UNAUTHORIZED",message:"A valid staff session is required."});
  const sessionKey=activitySessionKey(token,ctx.user.id,ctx.user.impersonation?.actor.id??0);
  const db=await activityDb();const now=Date.now();
  // Prevent burst inflation and polling; a lead switch remains a distinct event.
  const [last]=await db.select({page:staffActivityEvents.page,leadId:staffActivityEvents.leadId}).from(staffActivityEvents).where(and(eq(staffActivityEvents.sessionKey,sessionKey),eq(staffActivityEvents.kind,input.kind),gte(staffActivityEvents.occurredAt,now-(input.kind==="interaction"?5_000:1_000)))).orderBy(desc(staffActivityEvents.occurredAt)).limit(1);
  if(last&&last.page===input.page&&last.leadId===(input.leadId??null)) return {recorded:false};
  if (!ctx.user.impersonation) await ensureSessionStart(ctx.user.id, token);
  await insertEvent({eventKey:digest(`${sessionKey}:${input.eventId}`),userId:ctx.user.id,sessionKey,impersonatedById:ctx.user.impersonation?.actor.id??null,kind:input.kind,page:input.page,leadId:input.leadId??null,occurredAt:now});
  return {recorded:true};
}
export async function recordLoginActivity(userId:number,token:string) {
  try {const user=await getUserById(userId);if(!user||user.role!=="user"||user.loginMethod!=="local"||!(await getUserAccess(user)).isActive)return;
    await ensureSessionStart(userId, token);
  } catch { console.warn("[Measure] Login activity could not be recorded"); }
}
export async function recordLogoutActivity(ctx:TrpcContext) {
  try {if(!ctx.user||ctx.user.role!=="user"||ctx.user.loginMethod!=="local")return;const token=parse(ctx.req.headers.cookie??"")[COOKIE_NAME];if(!token)return;
    if (!ctx.user.impersonation) await ensureSessionStart(ctx.user.id, token);
    const sessionKey=activitySessionKey(token,ctx.user.id,ctx.user.impersonation?.actor.id??0);await insertEvent({eventKey:randomUUID(),userId:ctx.user.id,sessionKey,impersonatedById:ctx.user.impersonation?.actor.id??null,kind:"logout",occurredAt:Date.now()});
  } catch { console.warn("[Measure] Logout activity could not be recorded"); }
}
/** Only successful user-triggered writes, never polling or tracking itself. */
export async function recordSuccessfulMutation(ctx:TrpcContext,path:string) {
  try {
    if(!ctx.user||ctx.user.role!=="user"||ctx.user.loginMethod!=="local"||!path.startsWith("leads.")&&!path.startsWith("groups.")&&!path.startsWith("mail.")&&!path.startsWith("orders.")&&!path.startsWith("customers.")&&!path.startsWith("emailLibrary."))return;
    if(/duplicate|preview|test|export/i.test(path))return;
    if(!(await getUserAccess(ctx.user)).isActive)return;
    const token=parse(ctx.req.headers.cookie??"")[COOKIE_NAME];if(!token)return;
    if (!ctx.user.impersonation) await ensureSessionStart(ctx.user.id, token);
    const sessionKey=activitySessionKey(token,ctx.user.id,ctx.user.impersonation?.actor.id??0);
    await insertEvent({eventKey:randomUUID(),userId:ctx.user.id,sessionKey,impersonatedById:ctx.user.impersonation?.actor.id??null,kind:"other_action",occurredAt:Date.now()});
  } catch { console.warn("[Measure] Action activity could not be recorded"); }
}
