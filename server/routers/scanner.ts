import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import { protectedProcedure, router } from "../_core/trpc";
import { assertPermission } from "../permissions";
import { inferSupportedStateCode } from "../../shared/leadClassification";
import { EMPTY_FACESHEET_DATA, EMPTY_REFERRAL_DATA, inferDiagnosisCategory, isProhibitedSensitiveItem } from "../../shared/referralDocuments";

const facesheetProperties = Object.fromEntries(Object.keys(EMPTY_FACESHEET_DATA).map(key => [
  key,
  key === "icdCodes" ? { type: "array", items: { type: "string" } } : { type: "string" },
]));

const fileSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataUrl: z.string().max(45_000_000),
});

export const scannerExtractionSchema = {
  type: "object",
  properties: {
    firstName: { type: "string" },
    lastName: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    dateOfBirth: { type: "string" },
    sex: { type: "string" },
    medicalRecordNumber: { type: "string" },
    address: { type: "string" },
    city: { type: "string" },
    stateProvince: { type: "string" },
    stateCode: { type: "string", enum: ["FL", "AZ", "NV", "CA", "OR", "unknown"] },
    postalCode: { type: "string" },
    country: { type: "string" },
    diagnosis: { type: "string" },
    diagnosisCategory: { type: "string", enum: ["oncology", "hematology", "unknown"] },
    clinicalNotes: { type: "string" },
    documentCategory: { type: "string", enum: ["referral_order", "referral_form", "hospital_facesheet_standard", "hospital_facesheet_extended", "regular"] },
    referral: {
      type: "object",
      properties: {
        referralDate: { type: "string" },
        referralReason: { type: "string" },
        orderName: { type: "string" },
        urgency: { type: "string" },
        appointmentInstructions: { type: "string" },
        requestedVisits: { type: "string" },
        authorizationNumber: { type: "string" },
        authorizationStatus: { type: "string" },
        authorizationStartDate: { type: "string" },
        authorizationEndDate: { type: "string" },
        insuranceCarrier: { type: "string" },
        insurancePlan: { type: "string" },
        memberId: { type: "string" },
        groupNumber: { type: "string" },
        policyHolder: { type: "string" },
        referringProviderName: { type: "string" },
        referringProviderCredentials: { type: "string" },
        referringProviderPractice: { type: "string" },
        referringProviderSpecialty: { type: "string" },
        referringProviderNpi: { type: "string" },
        referringProviderPhone: { type: "string" },
        referringProviderFax: { type: "string" },
        referringProviderAddress: { type: "string" },
        receivingProviderName: { type: "string" },
        receivingProviderPractice: { type: "string" },
        receivingProviderSpecialty: { type: "string" },
        receivingProviderNpi: { type: "string" },
        receivingProviderPhone: { type: "string" },
        receivingProviderFax: { type: "string" },
        receivingProviderAddress: { type: "string" },
        icdCodes: { type: "array", items: { type: "string" } },
        cptCodes: { type: "array", items: { type: "string" } },
      },
      required: Object.keys(EMPTY_REFERRAL_DATA),
      additionalProperties: false,
    },
    facesheet: {
      type: "object",
      properties: facesheetProperties,
      required: Object.keys(EMPTY_FACESHEET_DATA),
      additionalProperties: false,
    },
    documentTypes: { type: "array", items: { type: "string" } },
    additionalInformation: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          value: { type: "string" },
          section: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["label", "value", "section", "confidence"],
        additionalProperties: false,
      },
    },
    overallConfidence: { type: "number", minimum: 0, maximum: 1 },
    reviewWarnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "firstName",
    "lastName",
    "email",
    "phone",
    "dateOfBirth",
    "sex",
    "medicalRecordNumber",
    "address",
    "city",
    "stateProvince",
    "stateCode",
    "postalCode",
    "country",
    "diagnosis",
    "diagnosisCategory",
    "clinicalNotes",
    "documentCategory",
    "referral",
    "facesheet",
    "documentTypes",
    "additionalInformation",
    "overallConfidence",
    "reviewWarnings",
  ],
  additionalProperties: false,
} as const;

export const SCANNER_SYSTEM_PROMPT = "You extract patient and clinical information from medical document images, including referral documents and Hospital Facesheets. Read all images as one patient case. The lead identity, phone, email, and address fields must always describe the PATIENT, never a provider, facility, insurer, policy holder, guarantor, emergency contact, fax sender, or recipient. Copy only visible facts; never invent missing information. Use empty strings or empty arrays when a field is absent. Patient first name, last name, and date of birth are critical duplicate-check fields: copy the visible date exactly, never infer it from age, and add a review warning when it is absent, conflicting, or unclear. Classify documentCategory as referral_order only for an explicit referral order; referral_form only for an explicit referral or authorization form; hospital_facesheet_standard for a hospital facesheet with the compact/legacy C-105 layout and basic insurance blocks; hospital_facesheet_extended for a hospital facesheet with the newer expanded multi-insurance layout, patient label, or barcodes; and regular for every other non-referral record. Both facesheet categories are Hospital Facesheets, not referrals. Put explicit facesheet data in the facesheet object: facility and encounter identifiers; arrival, admission, discharge, room, and length-of-stay values; demographics and patient alternate contacts; next of kin, emergency contact, and guarantor; primary and secondary insurance; care-team names; documented admit/principal/other diagnoses, visit reason, procedures, and ICD codes. M/R or MRN is medicalRecordNumber; FIN is financialAccountNumber. HOME PHONE is the top-level patient phone. If HOME PHONE is absent, a clearly patient-labeled CELL/ALT PHONE may be used. Never substitute contact, guarantor, insurance, provider, or facility phone numbers for the patient phone. Keep visitReason separate from diagnosis and never infer a diagnosis from symptoms. Clearly legible handwritten clinical annotations are visible facts: include them in clinicalNotes and, when they explicitly name a diagnosis, include that wording in diagnosis too, while adding a review warning that it was handwritten. For referral documents, separately extract referring and receiving provider details, insurance, authorization, visit count, priority, appointment instructions, ICD codes, and CPT/HCPCS codes into referral. Preserve diagnosis wording accurately. Set diagnosisCategory to hematology for blood disorders such as anemia or neutropenia, oncology for cancer/malignancy/neoplasm, and unknown only when neither is supported. Put every other useful visible fact in additionalInformation with a section, without duplicating structured fields. Set stateCode to FL, AZ, NV, CA, or OR when the PATIENT state, address, or ZIP code clearly identifies Florida, Arizona, Nevada, California, or Oregon; otherwise use unknown. Never return or store Social Security numbers or mother's maiden names, even if visible. Flag ambiguous, conflicting, cut-off, handwritten-over, screen-photographed, or low-confidence values in reviewWarnings. The output will always be reviewed by authorized staff before saving.";

export function normalizeScannerExtraction(extracted: Record<string, any>) {
  const referral = { ...EMPTY_REFERRAL_DATA, ...(extracted.referral ?? {}) };
  const facesheet = { ...EMPTY_FACESHEET_DATA, ...(extracted.facesheet ?? {}) };
  const reviewWarnings = Array.isArray(extracted.reviewWarnings) ? extracted.reviewWarnings : [];
  if (!String(extracted.dateOfBirth ?? "").trim()) reviewWarnings.push("Date of birth was not found. Enter it manually before creating the lead so duplicate protection can run.");
  const facesheetDiagnosis = [facesheet.admitDiagnosis, facesheet.principalDiagnosis, facesheet.otherDiagnoses].filter(Boolean).join("; ");
  const diagnosis = String(extracted.diagnosis ?? "").trim() || facesheetDiagnosis;
  return {
    ...extracted,
    diagnosis,
    phone: String(extracted.phone ?? "").trim() || facesheet.cellPhone || facesheet.alternatePhone,
    referral,
    facesheet,
    reviewWarnings: Array.from(new Set(reviewWarnings)),
    additionalInformation: Array.isArray(extracted.additionalInformation)
      ? extracted.additionalInformation.filter((item: { label?: string; value?: string }) => item.label && item.value && !isProhibitedSensitiveItem({ label: item.label, value: item.value }))
      : [],
    stateCode: inferSupportedStateCode(extracted) ?? "",
    diagnosisCategory: inferDiagnosisCategory({
      diagnosis: [diagnosis, facesheetDiagnosis].filter(Boolean).join("; "),
      referralReason: referral.referralReason,
      orderName: referral.orderName,
      receivingProviderSpecialty: referral.receivingProviderSpecialty,
    }) || (extracted.diagnosisCategory === "unknown" ? "" : extracted.diagnosisCategory) || "",
  };
}

export const scannerRouter = router({
  extract: protectedProcedure
    .input(z.object({ files: z.array(fileSchema).min(1).max(6) }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "scanDocuments");
      await assertPermission(ctx.user, "viewClinical");
      const invalid = input.files.find(file => !file.dataUrl.startsWith(`data:${file.mimeType};base64,`));
      if (invalid) throw new TRPCError({ code: "BAD_REQUEST", message: "A document has an invalid file encoding." });

      const response = await invokeLLM({
        model: "gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              SCANNER_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Extract and reconcile information from these ${input.files.length} document image(s).` },
              ...input.files.map(file => ({
                type: "image_url" as const,
                image_url: { url: file.dataUrl, detail: "high" as const },
              })),
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "customer_document_extraction", strict: true, schema: scannerExtractionSchema },
        },
        max_tokens: 8192,
      });

      const upstreamError = (response as unknown as { error?: { message?: string } }).error?.message;
      if (!Array.isArray(response.choices)) throw new Error(upstreamError || "The scanner returned an unexpected response.");
      const content = response.choices[0]?.message.content;
      if (typeof content !== "string") throw new Error("The scanner returned an unexpected response.");
      try {
        return normalizeScannerExtraction(JSON.parse(content));
      } catch {
        throw new Error("The scanner could not produce valid structured information.");
      }
    }),
});
