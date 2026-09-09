import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { assertPermission } from "../permissions";
import { prepareAuditEvents } from "../leadAudit";
import { storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";

const statusEnum = z.enum([
  "new", "pending_review", "verified", "to_contact", "contacted", "follow_up",
  "interested", "highly_interested", "qualified", "customer", "buyer",
  "not_interested", "unable_to_reach", "archived",
]);
const interestEnum = z.enum(["unknown", "cold", "warm", "hot"]);
const nullableText = z.string().max(20_000).optional().nullable();
const leadFields = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().max(320).optional().nullable(),
  phone: z.string().max(80).optional().nullable(),
  dateOfBirth: z.string().max(80).optional().nullable(),
  address: nullableText,
  city: z.string().max(120).optional().nullable(),
  stateProvince: z.string().max(120).optional().nullable(),
  postalCode: z.string().max(40).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  diagnosis: nullableText,
  clinicalNotes: nullableText,
  additionalInformation: nullableText,
  status: statusEnum.default("new"),
  interestLevel: interestEnum.default("unknown"),
  assignedTo: z.number().int().positive().optional().nullable(),
  nextFollowUpAt: z.number().int().positive().optional().nullable(),
});
const documentSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataUrl: z.string().max(9_000_000),
});

function hideClinical<T extends { diagnosis: string | null; clinicalNotes: string | null; additionalInformation: string | null }>(lead: T) {
  return { ...lead, diagnosis: null, clinicalNotes: null, additionalInformation: null };
}

export const leadsRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().max(120).optional(), status: z.string().max(40).optional(), assignedTo: z.number().int().positive().optional() }))
    .query(async ({ ctx, input }) => {
      const access = await assertPermission(ctx.user, "viewLeads");
      const rows = await db.listLeads(input);
      return access.permissions.viewClinical ? rows : rows.map(hideClinical);
    }),

  get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const access = await assertPermission(ctx.user, "viewLeads");
    const result = await db.getLead(input.id);
    if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
    const auditEvents = prepareAuditEvents(result.auditEvents, access.permissions.viewClinical);
    return access.permissions.viewClinical
      ? { ...result, auditEvents }
      : { ...result, lead: hideClinical(result.lead), documents: [], auditEvents };
  }),

  assignees: protectedProcedure.query(async ({ ctx }) => {
    await assertPermission(ctx.user, "viewLeads");
    return db.listAssignableStaff();
  }),

  create: protectedProcedure
    .input(z.object({ lead: leadFields, documents: z.array(documentSchema).max(6) }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "createLeads");
      if (input.documents.length) {
        await assertPermission(ctx.user, "scanDocuments");
        await assertPermission(ctx.user, "viewClinical");
      }
      if (input.lead.diagnosis || input.lead.clinicalNotes || input.lead.additionalInformation) {
        await assertPermission(ctx.user, "viewClinical");
      }
      const leadId = await db.createLeadWithAudit(
        { ...input.lead, createdBy: ctx.user.id },
        { actorId: ctx.user.id, source: "reviewed_scan", detail: `Initial reviewed state · ${input.documents.length} source document(s)` },
      );

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
    .input(z.object({ id: z.number().int().positive(), lead: leadFields.partial() }))
    .mutation(async ({ ctx, input }) => {
      const nonStatusFields = Object.keys(input.lead).filter(key => key !== "status");
      if (nonStatusFields.length > 0) await assertPermission(ctx.user, "editLeads");
      if (input.lead.status) await assertPermission(ctx.user, "changeStatus");
      if (input.lead.diagnosis !== undefined || input.lead.clinicalNotes !== undefined || input.lead.additionalInformation !== undefined) {
        await assertPermission(ctx.user, "viewClinical");
      }
      if (input.lead.assignedTo) {
        const assignees = await db.listAssignableStaff();
        if (!assignees.some(staff => staff.id === input.lead.assignedTo)) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active staff member." });
      }
      const fields = Object.keys(input.lead);
      const action = fields.length === 1 && fields[0] === "status"
        ? "lead.status_changed"
        : fields.length === 1 && fields[0] === "interestLevel"
          ? "lead.interest_changed"
          : "lead.updated";
      const result = await db.updateLeadWithAudit(input.id, input.lead, {
        actorId: ctx.user.id,
        action,
        source: action === "lead.updated" ? "profile_edit" : "quick_action",
        detail: `Updated ${fields.length} field${fields.length === 1 ? "" : "s"}`,
      });
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
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "manageContacts");
      const result = await db.addCommunicationWithAudit({ ...input, createdBy: ctx.user.id });
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      return { success: true };
    }),
});
