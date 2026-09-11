import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { analyzeBulkLeadDuplicates, MAX_BULK_LEADS } from "../bulkLeadImport";
import { prepareAuditEvents } from "../leadAudit";
import { createLeadExport, LEAD_STATUS_LABELS } from "../leadExport";
import { isDuplicateKeyError, isLeadDuplicateError } from "../leadIdentity";
import { normalizeDateOfBirth } from "../leadIdentity";
import { assertPermission } from "../permissions";
import { storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";

const statusEnum = z.enum([
  "new", "pending_review", "verified", "to_contact", "contacted", "follow_up",
  "interested", "highly_interested", "qualified", "customer", "buyer",
  "not_interested", "unable_to_reach", "archived",
]);
const interestEnum = z.enum(["unknown", "cold", "warm", "hot"]);
const stateCodeEnum = z.enum(["FL", "AZ", "NV", "CA", "OR"]);
const diagnosisCategoryEnum = z.enum(["oncology", "hematology"]);
const documentTypeEnum = z.enum(["referral_order", "referral_form", "regular"]);
const preferredLanguageEnum = z.enum(["en", "es"]);
const nullableText = z.string().max(20_000).optional().nullable();
const leadFields = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  preferredLanguage: preferredLanguageEnum.default("en"),
  email: z.string().max(320).optional().nullable(),
  phone: z.string().max(80).optional().nullable(),
  dateOfBirth: z.string().max(80).optional().nullable(),
  address: nullableText,
  city: z.string().max(120).optional().nullable(),
  stateProvince: z.string().max(120).optional().nullable(),
  postalCode: z.string().max(40).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  diagnosis: nullableText,
  diagnosisCategory: diagnosisCategoryEnum,
  stateCode: stateCodeEnum,
  clinicalNotes: nullableText,
  additionalInformation: nullableText,
  sourceDocumentType: documentTypeEnum.optional().nullable(),
  status: statusEnum.default("new"),
  interestLevel: interestEnum.default("unknown"),
  assignedTo: z.number().int().positive().optional().nullable(),
  nextFollowUpAt: z.number().int().positive().optional().nullable(),
});
export const leadUpdateFields = leadFields.partial().extend({
  preferredLanguage: preferredLanguageEnum.optional(),
  status: statusEnum.optional(),
  interestLevel: interestEnum.optional(),
});
const documentSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataUrl: z.string().max(45_000_000),
});

function hideClinical<T extends { diagnosis: string | null; clinicalNotes: string | null; additionalInformation: string | null }>(lead: T) {
  return { ...lead, diagnosis: null, clinicalNotes: null, additionalInformation: null };
}

function throwDuplicate(error: unknown): never {
  if (isLeadDuplicateError(error)) throw new TRPCError({ code: "CONFLICT", message: "Duplicate lead detected. The matching record may belong to another staff member; contact the Super Admin if you cannot access it." });
  if (isDuplicateKeyError(error)) throw new TRPCError({ code: "CONFLICT", message: "Duplicate lead detected by email, phone, or profile identity." });
  throw error;
}

export const leadsRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().max(120).optional(),
      status: z.string().max(40).optional(),
      interestLevel: interestEnum.optional(),
      assignedTo: z.union([z.number().int().positive(), z.literal("unassigned")]).optional(),
      followUpState: z.enum(["overdue", "upcoming", "none"]).optional(),
      contactState: z.enum(["contacted", "not_contacted"]).optional(),
      preferredLanguage: preferredLanguageEnum.optional(),
      stateCode: stateCodeEnum.optional(),
      diagnosisCategory: diagnosisCategoryEnum.optional(),
      groupId: z.number().int().positive().optional(),
      createdFrom: z.number().int().positive().optional(),
      createdTo: z.number().int().positive().optional(),
      sort: z.enum(["updated_desc", "created_desc", "name_asc", "name_desc", "follow_up_asc"]).default("updated_desc"),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(10).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      const access = await assertPermission(ctx.user, "viewLeads");
      const result = await db.listLeads(input, { userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" });
      return access.permissions.viewClinical ? result : { ...result, items: result.items.map(hideClinical) };
    }),

  exportSummary: protectedProcedure.query(async ({ ctx }) => {
    const access = await assertPermission(ctx.user, "exportData");
    const counts = await db.getLeadStatusCounts({ userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" });
    return { total: counts.reduce((sum, item) => sum + Number(item.count), 0), counts: Object.fromEntries(counts.map(item => [item.status, Number(item.count)])), limit: 5000 };
  }),

  export: protectedProcedure
    .input(z.object({ statuses: z.array(statusEnum).min(1).max(14), format: z.enum(["csv", "xlsx", "pdf"]) }))
    .mutation(async ({ ctx, input }) => {
      const access = await assertPermission(ctx.user, "exportData");
      const rows = await db.getLeadExportRows(input.statuses, { userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" });
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "No leads match the selected statuses." });
      const file = await createLeadExport(input.format, rows, input.statuses);
      const timestamp = new Date().toISOString().replaceAll(":", "-").replace(".000Z", "Z");
      await db.addAuditEvent({ leadId: null, actorId: ctx.user.id, action: "leads.exported", source: "export", detail: `${rows.length} lead(s) · ${input.format.toUpperCase()} · ${input.statuses.map(status => LEAD_STATUS_LABELS[status]).join(", ")}`, occurredAt: Date.now() });
      return { fileName: `careflow-leads-${timestamp}.${file.extension}`, mimeType: file.mimeType, dataBase64: file.buffer.toString("base64"), count: rows.length };
    }),

  get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    const result = await db.getLead(input.id, { userId: ctx.user.id, isSuperAdmin: access.role === "super_admin" });
    if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
    const auditEvents = prepareAuditEvents(result.auditEvents, access.permissions.viewClinical);
    return access.permissions.viewClinical ? { ...result, auditEvents } : { ...result, lead: hideClinical(result.lead), documents: [], auditEvents };
  }),

  assignees: protectedProcedure.query(async ({ ctx }) => {
    await assertPermission(ctx.user, "viewLeads");
    return db.listAssignableStaff();
  }),

  duplicateCheck: protectedProcedure
    .input(z.object({
      firstName: z.string().trim().min(1).max(120),
      lastName: z.string().trim().min(1).max(120),
      email: z.string().max(320).optional().nullable(),
      phone: z.string().max(80).optional().nullable(),
      dateOfBirth: z.string().trim().min(1).max(80),
      address: z.string().max(20_000).optional().nullable(),
      postalCode: z.string().max(40).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "createLeads");
      if (!normalizeDateOfBirth(input.dateOfBirth)) throw new TRPCError({ code: "BAD_REQUEST", message: "A valid date of birth is required for duplicate checking." });
      const duplicate = await db.findDuplicateLead(input);
      if (!duplicate) return { duplicate: null };
      const access = await db.canAccessLead(duplicate.leadId, ctx.user.id, ctx.user.role === "admin");
      return { duplicate: access ? duplicate : { leadId: 0, firstName: "Existing", lastName: "lead", matchedBy: duplicate.matchedBy } };
    }),

  bulkDuplicateCheck: protectedProcedure
    .input(z.object({ leads: z.array(z.object({
      firstName: z.string().trim().min(1).max(120),
      lastName: z.string().trim().min(1).max(120),
      email: z.string().max(320).optional().nullable(),
      phone: z.string().max(80).optional().nullable(),
      dateOfBirth: z.string().trim().min(1).max(80),
      address: z.string().max(20_000).optional().nullable(),
      postalCode: z.string().max(40).optional().nullable(),
    })).min(1).max(MAX_BULK_LEADS) }))
    .mutation(async ({ ctx, input }) => {
      const access = await assertPermission(ctx.user, "createLeads");
      if (input.leads.some(lead => !normalizeDateOfBirth(lead.dateOfBirth))) throw new TRPCError({ code: "BAD_REQUEST", message: "Every bulk image lead requires a valid date of birth for duplicate checking." });
      const existing = await db.findExistingLeadIdentityMatches(input.leads);
      const analyzed = analyzeBulkLeadDuplicates(input.leads, existing);
      return Promise.all(analyzed.map(async result => {
        if (!result.existing || await db.canAccessLead(result.existing.leadId, ctx.user.id, access.role === "super_admin")) return result;
        return { ...result, existing: { leadId: 0, firstName: "Existing", lastName: "lead", matchedBy: result.existing.matchedBy } };
      }));
    }),

  create: protectedProcedure
    .input(z.object({ lead: leadFields, documents: z.array(documentSchema).max(6) }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "createLeads");
      if (input.documents.length) {
        await assertPermission(ctx.user, "scanDocuments");
        await assertPermission(ctx.user, "viewClinical");
        if (!normalizeDateOfBirth(input.lead.dateOfBirth)) throw new TRPCError({ code: "BAD_REQUEST", message: "Date of birth is required for image-created leads so name and date-of-birth duplicate protection can run." });
      }
      if (input.lead.diagnosis || input.lead.clinicalNotes || input.lead.additionalInformation) await assertPermission(ctx.user, "viewClinical");
      let leadId: number;
      try {
        leadId = await db.createLeadWithAudit(
          { ...input.lead, createdBy: ctx.user.id },
          { actorId: ctx.user.id, source: "reviewed_scan", detail: `Initial reviewed state · ${input.documents.length} source document(s)` },
        );
      } catch (error) { throwDuplicate(error); }

      for (const file of input.documents) {
        const match = file.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
        if (!match || match[1] !== file.mimeType) throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid document: ${file.name}` });
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const bytes = Buffer.from(match[2], "base64");
        if (bytes.length > 6_000_000) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: `${file.name} exceeds 6 MB.` });
        const stored = await storagePut(`leads/${leadId}/${safeName}`, bytes, file.mimeType);
        await db.addLeadDocument({ leadId, fileName: file.name, mimeType: file.mimeType, fileKey: stored.key, fileUrl: stored.url, uploadedBy: ctx.user.id });
      }
      return { id: leadId };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), lead: leadUpdateFields }))
    .mutation(async ({ ctx, input }) => {
      const viewAccess = await assertPermission(ctx.user, "viewLeads");
      if (!await db.canAccessLead(input.id, ctx.user.id, viewAccess.role === "super_admin")) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      const nonStatusFields = Object.keys(input.lead).filter(key => key !== "status");
      if (nonStatusFields.length > 0) await assertPermission(ctx.user, "editLeads");
      if (input.lead.status) await assertPermission(ctx.user, "changeStatus");
      if (input.lead.diagnosis !== undefined || input.lead.clinicalNotes !== undefined || input.lead.additionalInformation !== undefined || input.lead.sourceDocumentType !== undefined) await assertPermission(ctx.user, "viewClinical");
      if (input.lead.assignedTo) {
        const assignees = await db.listAssignableStaff();
        if (!assignees.some(staff => staff.id === input.lead.assignedTo)) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active staff member." });
      }
      const fields = Object.keys(input.lead);
      const action = fields.length === 1 && fields[0] === "status" ? "lead.status_changed" : fields.length === 1 && fields[0] === "interestLevel" ? "lead.interest_changed" : "lead.updated";
      let result;
      try {
        result = await db.updateLeadWithAudit(input.id, input.lead, { actorId: ctx.user.id, action, source: action === "lead.updated" ? "profile_edit" : "quick_action", detail: `Updated ${fields.length} field${fields.length === 1 ? "" : "s"}` });
      } catch (error) { throwDuplicate(error); }
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      return { success: true, changed: result.changes.length > 0 };
    }),

  addCommunication: protectedProcedure
    .input(z.object({
      leadId: z.number().int().positive(),
      method: z.enum(["phone", "email", "sms", "in_person", "other"]),
      direction: z.enum(["outbound", "inbound"]),
      outcome: z.string().trim().min(1).max(160),
      notes: z.string().max(20_000).optional().nullable(),
      contactedAt: z.number().int().positive(),
      nextFollowUpAt: z.number().int().positive().optional().nullable(),
      clearFollowUp: z.boolean().optional(),
      completeFollowUp: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const access = await assertPermission(ctx.user, "manageContacts");
      if (!await db.canAccessLead(input.leadId, ctx.user.id, access.role === "super_admin")) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      let result;
      try {
        result = await db.addCommunicationWithAudit({ ...input, createdBy: ctx.user.id });
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "FOLLOW_UP_NOT_ACTIVE") throw new TRPCError({ code: "CONFLICT", message: error.message });
        throw error;
      }
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      return { success: true };
    }),
});
