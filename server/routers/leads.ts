import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { analyzeBulkLeadDuplicates, MAX_BULK_LEADS } from "../bulkLeadImport";
import { prepareAuditEvents } from "../leadAudit";
import { createLeadExport, LEAD_STATUS_LABELS } from "../leadExport";
import { isDuplicateKeyError, isLeadDuplicateError } from "../leadIdentity";
import { normalizeDateOfBirth } from "../leadIdentity";
import { assertPermission, hasGlobalLeadAccess } from "../permissions";
import { canEditLeadField, canViewLeadField, canViewUnredactedDocuments, hasHiddenLeadFields, redactLeadAuditEvents, redactLeadFields, assertLeadPatchEditable, allLeadInformationEditable, LeadFieldAccessError, LeadFieldInputError } from "../leadFieldAccess";
import type { LeadFieldAccess } from "@shared/leadFieldPermissions";
import { storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";

const statusEnum = z.enum([
  "new", "pending_review", "verified", "to_contact", "voicemail_left", "contacted", "follow_up",
  "interested", "highly_interested", "qualified", "customer", "buyer",
  "not_interested", "unable_to_reach", "archived",
]);
const interestEnum = z.enum(["unknown", "cold", "warm", "hot"]);
const stateCodeEnum = z.enum(["FL", "AZ", "NV", "CA", "OR"]);
const diagnosisCategoryEnum = z.enum(["oncology", "hematology"]);
const documentTypeEnum = z.enum(["referral_order", "referral_form", "hospital_facesheet_standard", "hospital_facesheet_extended", "regular"]);
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
export const leadUpdateFields = leadFields.omit({ nextFollowUpAt: true }).partial().extend({
  preferredLanguage: preferredLanguageEnum.optional(),
  status: statusEnum.optional(),
  interestLevel: interestEnum.optional(),
});
const documentSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataUrl: z.string().max(45_000_000),
});

export const MAX_LEAD_DOCUMENT_BYTES = 25_000_000;
export const MAX_LEAD_DOCUMENT_BATCH_BYTES = 32_000_000;

function assertLeadQuerySafe(input: {
  search?: string;
  status?: string;
  interestLevel?: string;
  assignedTo?: number | "unassigned";
  followUpState?: string;
  contactState?: string;
  preferredLanguage?: string;
  stateCode?: string;
  diagnosisCategory?: string;
  sort?: string;
}, access: LeadFieldAccess) {
  const canView = (key: string) => canViewLeadField(access, key);
  if (input.search && ["firstName", "lastName", "email", "phone", "address"].some(key => !canView(key))) throw new TRPCError({ code: "FORBIDDEN", message: "Search is unavailable while a searchable lead identity field is hidden." });
  if (input.status && input.status !== "all" && !canView("status")) throw new TRPCError({ code: "FORBIDDEN", message: "Status filtering is unavailable because status is hidden." });
  if (input.interestLevel && !canView("interestLevel")) throw new TRPCError({ code: "FORBIDDEN", message: "Interest filtering is unavailable because interest is hidden." });
  if (input.assignedTo !== undefined && !canView("assignedTo")) throw new TRPCError({ code: "FORBIDDEN", message: "Assignment filtering is unavailable because assignment is hidden." });
  if (input.followUpState && !canView("nextFollowUpAt")) throw new TRPCError({ code: "FORBIDDEN", message: "Follow-up filtering is unavailable because follow-up is hidden." });
  if (input.contactState && !canView("lastContactAt")) throw new TRPCError({ code: "FORBIDDEN", message: "Contact filtering is unavailable because contact timing is hidden." });
  if (input.preferredLanguage && !canView("preferredLanguage")) throw new TRPCError({ code: "FORBIDDEN", message: "Language filtering is unavailable because language is hidden." });
  if (input.stateCode && !canView("stateCode")) throw new TRPCError({ code: "FORBIDDEN", message: "State filtering is unavailable because state is hidden." });
  if (input.diagnosisCategory && !canView("diagnosisCategory")) throw new TRPCError({ code: "FORBIDDEN", message: "Diagnosis filtering is unavailable because diagnosis is hidden." });
  if ((input.sort === "name_asc" || input.sort === "name_desc") && (!canView("firstName") || !canView("lastName"))) throw new TRPCError({ code: "FORBIDDEN", message: "Name sorting is unavailable while a name field is hidden." });
  if (input.sort === "follow_up_asc" && !canView("nextFollowUpAt")) throw new TRPCError({ code: "FORBIDDEN", message: "Follow-up sorting is unavailable because follow-up is hidden." });
}

function safeMatchedBy(matchedBy: string[], access: Parameters<typeof canViewLeadField>[0]) {
  return matchedBy.map(label => {
    const key = label === "email" ? "email" : label === "phone" ? "phone" : "firstName";
    return canViewLeadField(access, key) ? label : "identity match";
  });
}

function assertDuplicateQuerySafe(input: {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  dateOfBirth: string;
  address?: string | null;
  postalCode?: string | null;
}, access: LeadFieldAccess) {
  const fields: Array<[keyof typeof input, string]> = [
    ["firstName", "firstName"], ["lastName", "lastName"], ["dateOfBirth", "dateOfBirth"],
    ["email", "email"], ["phone", "phone"], ["address", "address"], ["postalCode", "address"],
  ];
  for (const [inputKey, fieldKey] of fields) {
    if (input[inputKey] != null && String(input[inputKey]).trim() !== "" && !canViewLeadField(access, fieldKey)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Duplicate checking is unavailable while an identity field is hidden." });
    }
  }
}

function genericDuplicateMatch() {
  return { leadId: 0, firstName: "Existing", lastName: "lead", matchedBy: ["identity match"] };
}

export function prepareLeadDocuments(files: Array<z.infer<typeof documentSchema>>) {
  const prepared = files.map(file => {
    const match = file.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match || match[1] !== file.mimeType) throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid document: ${file.name}` });
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > MAX_LEAD_DOCUMENT_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: `${file.name} exceeds 25 MB.` });
    return { ...file, safeName: file.name.replace(/[^a-zA-Z0-9._-]/g, "_"), bytes };
  });
  const totalBytes = prepared.reduce((sum, file) => sum + file.bytes.length, 0);
  if (totalBytes > MAX_LEAD_DOCUMENT_BATCH_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "The selected images exceed 32 MB together. Upload fewer pages; CareFlow will not reduce OCR quality." });
  return prepared;
}

function hideEmailCommunicationText<T extends { method: string; outcome: string; notes: string | null }>(communication: T) {
  return communication.method === "email"
    ? { ...communication, outcome: "Email communication", notes: null }
    : communication;
}

function hideEmailAuditValues<T extends {
  detail: string | null;
  changes: Array<{ field: string; before: unknown; after: unknown }>;
  snapshotBefore: Record<string, unknown>;
  snapshotAfter: Record<string, unknown>;
  source?: string | null;
}>(event: T) {
  const changes = event.changes.filter(change => change.field !== "email");
  const redactSnapshot = (snapshot: Record<string, unknown>) => {
    const { email: _email, ...safeSnapshot } = snapshot;
    return safeSnapshot;
  };
  const isEmailCommunication = event.source === "communication" && /^email\s*:/i.test(event.detail ?? "");
  return {
    ...event,
    detail: isEmailCommunication ? "Email communication recorded" : event.detail,
    changes,
    snapshotBefore: redactSnapshot(event.snapshotBefore),
    snapshotAfter: redactSnapshot(event.snapshotAfter),
  };
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
      assertLeadQuerySafe(input, access);
      const result = await db.listLeads(input, { userId: ctx.user.id, isSuperAdmin: hasGlobalLeadAccess(access) });
      return { ...result, items: result.items.map(item => redactLeadFields(item, access)) };
    }),

  exportSummary: protectedProcedure.query(async ({ ctx }) => {
    const access = await assertPermission(ctx.user, "exportData");
    if (!canViewLeadField(access, "status")) throw new TRPCError({ code: "FORBIDDEN", message: "Export summaries are unavailable because status is hidden." });
    const counts = await db.getLeadStatusCounts({ userId: ctx.user.id, isSuperAdmin: hasGlobalLeadAccess(access) });
    return { total: counts.reduce((sum, item) => sum + Number(item.count), 0), counts: Object.fromEntries(counts.map(item => [item.status, Number(item.count)])), limit: 5000 };
  }),

  export: protectedProcedure
    .input(z.object({ statuses: z.array(statusEnum).min(1).max(15), format: z.enum(["csv", "xlsx", "pdf"]) }))
    .mutation(async ({ ctx, input }) => {
      const access = await assertPermission(ctx.user, "exportData");
      if (!canViewLeadField(access, "status")) throw new TRPCError({ code: "FORBIDDEN", message: "Exports are unavailable because status is hidden." });
      const rows = await db.getLeadExportRows(input.statuses, { userId: ctx.user.id, isSuperAdmin: hasGlobalLeadAccess(access) });
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "No leads match the selected statuses." });
      const file = await createLeadExport(input.format, rows.map(row => ({ ...redactLeadFields(row, access), ...(!canViewLeadField(access, "assignedTo") ? { assignedStaff: "" } : {}) })), input.statuses);
      const timestamp = new Date().toISOString().replaceAll(":", "-").replace(".000Z", "Z");
      await db.addAuditEvent({ leadId: null, actorId: ctx.user.id, action: "leads.exported", source: "export", detail: `${rows.length} lead(s) · ${input.format.toUpperCase()} · ${input.statuses.map(status => LEAD_STATUS_LABELS[status]).join(", ")}`, occurredAt: Date.now() });
      return { fileName: `careflow-leads-${timestamp}.${file.extension}`, mimeType: file.mimeType, dataBase64: file.buffer.toString("base64"), count: rows.length };
    }),

  get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    const result = await db.getLead(input.id, { userId: ctx.user.id, isSuperAdmin: hasGlobalLeadAccess(access) });
    if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
    const auditEvents = redactLeadAuditEvents(prepareAuditEvents(result.auditEvents, access.permissions.viewClinical), access);
    const documents = canViewUnredactedDocuments(access) ? result.documents : [];
    const communications = hasHiddenLeadFields(access)
      ? result.communications.map(communication => ({ ...communication, outcome: "Communication recorded", notes: null, nextFollowUpAt: null }))
      : access.role === "super_admin" || access.permissions.manageEmails ? result.communications : result.communications.map(hideEmailCommunicationText);
    const followUps = !canViewLeadField(access, "nextFollowUpAt") ? [] : result.followUps.map(followUp => ({
      id: followUp.id,
      leadId: followUp.leadId,
      scheduledFor: followUp.scheduledFor,
      remindAt: followUp.remindAt,
      readAt: followUp.readAt,
    }));
    const safeAuditEvents = (access.role !== "super_admin" && !access.permissions.manageEmails)
      ? auditEvents.map(hideEmailAuditValues)
      : auditEvents;
    return { ...result, lead: redactLeadFields(result.lead, access), documents, communications, followUps, auditEvents: safeAuditEvents };
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
      const createAccess = await assertPermission(ctx.user, "createLeads");
      assertDuplicateQuerySafe(input, createAccess);
      if (!normalizeDateOfBirth(input.dateOfBirth)) throw new TRPCError({ code: "BAD_REQUEST", message: "A valid date of birth is required for duplicate checking." });
      const duplicate = await db.findDuplicateLead(input);
      if (!duplicate) return { duplicate: null };
      const access = await assertPermission(ctx.user, "viewLeads");
      const visible = await db.canAccessLead(duplicate.leadId, ctx.user.id, hasGlobalLeadAccess(access));
      return { duplicate: visible ? { ...redactLeadFields(duplicate, access), matchedBy: safeMatchedBy(duplicate.matchedBy, access) } : genericDuplicateMatch() };
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
      input.leads.forEach(lead => assertDuplicateQuerySafe(lead, access));
      if (input.leads.some(lead => !normalizeDateOfBirth(lead.dateOfBirth))) throw new TRPCError({ code: "BAD_REQUEST", message: "Every bulk image lead requires a valid date of birth for duplicate checking." });
      const existing = await db.findExistingLeadIdentityMatches(input.leads);
      const analyzed = analyzeBulkLeadDuplicates(input.leads, existing);
      return Promise.all(analyzed.map(async result => {
        if (!result.existing || !await db.canAccessLead(result.existing.leadId, ctx.user.id, hasGlobalLeadAccess(access))) return result.existing ? { ...result, existing: genericDuplicateMatch() } : result;
        return { ...result, existing: { ...redactLeadFields(result.existing, access), matchedBy: safeMatchedBy(result.existing.matchedBy, access) } };
      }));
    }),

  create: protectedProcedure
    .input(z.object({ lead: leadFields, documents: z.array(documentSchema).max(6) }))
    .mutation(async ({ ctx, input }) => {
      const access = await assertPermission(ctx.user, "createLeads");
      if (input.documents.length) {
        await assertPermission(ctx.user, "scanDocuments");
        await assertPermission(ctx.user, "viewClinical");
        if (!normalizeDateOfBirth(input.lead.dateOfBirth)) throw new TRPCError({ code: "BAD_REQUEST", message: "Date of birth is required for image-created leads so name and date-of-birth duplicate protection can run." });
      }
      if (input.lead.diagnosis || input.lead.clinicalNotes || input.lead.additionalInformation) await assertPermission(ctx.user, "viewClinical");
      try {
        assertLeadPatchEditable(input.lead as Record<string, unknown>, access, { allowRowOccurrences: false });
        if (input.documents.length && !allLeadInformationEditable(access)) throw new LeadFieldAccessError("Image-created leads require editable access to all lead fields.");
      } catch (error) {
        if (error instanceof LeadFieldInputError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        if (error instanceof LeadFieldAccessError) throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        throw error;
      }
      const preparedDocuments = prepareLeadDocuments(input.documents);
      let leadId: number;
      try {
        leadId = await db.createLeadWithAudit(
          { ...input.lead, createdBy: ctx.user.id },
          { actorId: ctx.user.id, source: "reviewed_scan", detail: `Initial reviewed state · ${input.documents.length} source document(s)` },
        );
      } catch (error) { throwDuplicate(error); }

      for (const file of preparedDocuments) {
        const stored = await storagePut(`leads/${leadId}/${file.safeName}`, file.bytes, file.mimeType);
        await db.addLeadDocument({ leadId, fileName: file.name, mimeType: file.mimeType, fileKey: stored.key, fileUrl: stored.url, uploadedBy: ctx.user.id });
      }
      return { id: leadId };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), lead: leadUpdateFields }))
    .mutation(async ({ ctx, input }) => {
      const viewAccess = await assertPermission(ctx.user, "viewLeads");
      if (!await db.canAccessLead(input.id, ctx.user.id, hasGlobalLeadAccess(viewAccess))) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      const nonStatusFields = Object.keys(input.lead).filter(key => key !== "status");
      if (nonStatusFields.length > 0) await assertPermission(ctx.user, "editLeads");
      if (input.lead.status) await assertPermission(ctx.user, "changeStatus");
      if (input.lead.diagnosis !== undefined || input.lead.clinicalNotes !== undefined || input.lead.additionalInformation !== undefined) await assertPermission(ctx.user, "viewClinical");
      if (input.lead.assignedTo) {
        const assignees = await db.listAssignableStaff();
        if (!assignees.some(staff => staff.id === input.lead.assignedTo)) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active staff member." });
      }
      const fields = Object.keys(input.lead);
      const action = fields.length === 1 && fields[0] === "status" ? "lead.status_changed" : fields.length === 1 && fields[0] === "interestLevel" ? "lead.interest_changed" : "lead.updated";
      let result;
      try {
        assertLeadPatchEditable(input.lead as Record<string, unknown>, viewAccess);
        result = await db.updateLeadWithAudit(input.id, input.lead, { actorId: ctx.user.id, action, source: action === "lead.updated" ? "profile_edit" : "quick_action", detail: `Updated ${fields.length} field${fields.length === 1 ? "" : "s"}` }, viewAccess);
      } catch (error) {
        if (error instanceof LeadFieldAccessError) throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        if (error instanceof LeadFieldInputError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        throwDuplicate(error);
      }
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      return { success: true, changed: result.changes.length > 0 };
    }),

  addCommunication: protectedProcedure
    .input(z.object({
      leadId: z.number().int().positive(),
      followUpId: z.number().int().positive().optional(),
      method: z.enum(["phone", "email", "sms", "in_person", "other"]),
      direction: z.enum(["outbound", "inbound"]),
      outcome: z.string().trim().min(1).max(160),
      notes: z.string().max(20_000).optional().nullable(),
      contactedAt: z.number().int().positive(),
      nextFollowUpAt: z.number().int().positive().optional().nullable(),
      completeFollowUp: z.boolean().optional(),
    }).refine(value => !value.completeFollowUp || Boolean(value.followUpId), { message: "Select the active follow-up to complete.", path: ["followUpId"] }))
    .mutation(async ({ ctx, input }) => {
      const access = await assertPermission(ctx.user, "manageContacts");
      if (input.method === "email") await assertPermission(ctx.user, "manageEmails");
      if (input.method === "email" && !canViewLeadField(access, "email")) throw new TRPCError({ code: "FORBIDDEN", message: "Email communication is unavailable because email is hidden." });
      if ((input.nextFollowUpAt != null || input.followUpId !== undefined || input.completeFollowUp === true) && !canEditLeadField(access, "nextFollowUpAt")) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot create or complete a follow-up while next follow-up is view-only or hidden." });
      if (!await db.canAccessLead(input.leadId, ctx.user.id, hasGlobalLeadAccess(access))) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      let result;
      try {
        result = await db.addCommunicationWithAudit({ ...input, createdBy: ctx.user.id });
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "FOLLOW_UP_NOT_ACTIVE") throw new TRPCError({ code: "CONFLICT", message: error.message });
        if (isDuplicateKeyError(error)) throw new TRPCError({ code: "CONFLICT", message: "This lead already has an active follow-up at that time." });
        throw error;
      }
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      return { success: true };
    }),
});
