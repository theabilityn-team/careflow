import type { Request } from "express";
import { eq } from "drizzle-orm";
import { leadDocuments } from "../drizzle/schema";
import { canViewUnredactedDocuments } from "../shared/leadFieldPermissions";
import { authenticateRequest } from "./auth";
import { canAccessLead, getDb } from "./db";
import { getUserAccess, hasGlobalLeadAccess } from "./permissions";

export const isReservedLeadStorageKey = (key: string) => /^(?:leads|direct-import|drive-import|imports|source-documents|originals)(?:\/|$)/i.test(key);
export async function findStoredLeadDocument(key: string) {
  const database = await getDb();
  if (!database) throw new Error("Document access unavailable");
  const document = (await database.select({ id: leadDocuments.id, leadId: leadDocuments.leadId, mimeType: leadDocuments.mimeType, fileKey: leadDocuments.fileKey })
    .from(leadDocuments).where(eq(leadDocuments.fileKey, key)).limit(1))[0] ?? null;
  if (document && document.fileKey !== key) throw new Error("Document access unavailable");
  return document;
}
export async function authorizeStoredLeadDocument(req: Request, leadId: number): Promise<boolean> {
  const principal = await authenticateRequest(req);
  if (!principal) return false;
  const access = await getUserAccess(principal);
  if (!access.isActive || !access.permissions.viewLeads || !canViewUnredactedDocuments(access)) return false;
  return canAccessLead(leadId, principal.id, hasGlobalLeadAccess(access));
}
