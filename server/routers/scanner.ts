import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import { protectedProcedure, router } from "../_core/trpc";
import { assertPermission } from "../permissions";
import { inferSupportedStateCode } from "../../shared/leadClassification";
import { EMPTY_REFERRAL_DATA, inferDiagnosisCategory, isProhibitedSensitiveItem } from "../../shared/referralDocuments";

const fileSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataUrl: z.string().max(9_000_000),
});

const extractionSchema = {
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
    documentCategory: { type: "string", enum: ["referral_order", "referral_form", "regular"] },
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
    "documentTypes",
    "additionalInformation",
    "overallConfidence",
    "reviewWarnings",
  ],
  additionalProperties: false,
} as const;

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
              "You extract patient and clinical information from medical document images, including referral orders and referral forms. Read all images as one patient case. The lead identity and address fields must always describe the PATIENT, never a provider, facility, policy holder, fax sender, or recipient. Copy only visible facts; never invent missing information. Use empty strings or empty arrays when a field is absent. Patient first name, last name, and date of birth are critical duplicate-check fields: copy the visible date exactly, never infer it from age, and add a review warning when it is absent, conflicting, or unclear. Classify documentCategory as referral_order only for an explicit referral order, referral_form only for an explicit referral or authorization form, and regular for all ordinary medical records, chart screens, demographics, clinical profiles, and every non-referral document. For referral documents, separately extract referring and receiving provider details, insurance, authorization, visit count, priority, appointment instructions, ICD codes, and CPT/HCPCS codes into referral. Preserve diagnosis wording accurately. Set diagnosisCategory to hematology for blood disorders such as anemia or neutropenia, oncology for cancer/malignancy/neoplasm, and unknown only when neither is supported. Put every other useful fact in additionalInformation with a section. Set stateCode to FL, AZ, NV, CA, or OR when the PATIENT state, address, or ZIP code clearly identifies Florida, Arizona, Nevada, California, or Oregon; otherwise use unknown. Never return or store Social Security numbers, even if visible. Do not confuse provider phone/fax with patient phone. Flag ambiguous, conflicting, or low-confidence values in reviewWarnings. The output will always be reviewed by authorized staff before saving.",
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
          json_schema: { name: "customer_document_extraction", strict: true, schema: extractionSchema },
        },
        max_tokens: 4096,
      });

      const upstreamError = (response as unknown as { error?: { message?: string } }).error?.message;
      if (!Array.isArray(response.choices)) throw new Error(upstreamError || "The scanner returned an unexpected response.");
      const content = response.choices[0]?.message.content;
      if (typeof content !== "string") throw new Error("The scanner returned an unexpected response.");
      try {
        const extracted = JSON.parse(content);
        const referral = { ...EMPTY_REFERRAL_DATA, ...(extracted.referral ?? {}) };
        const reviewWarnings = Array.isArray(extracted.reviewWarnings) ? extracted.reviewWarnings : [];
        if (!String(extracted.dateOfBirth ?? "").trim()) reviewWarnings.push("Date of birth was not found. Enter it manually before creating the lead so duplicate protection can run.");
        return {
          ...extracted,
          referral,
          reviewWarnings: Array.from(new Set(reviewWarnings)),
          additionalInformation: Array.isArray(extracted.additionalInformation)
            ? extracted.additionalInformation.filter((item: { label?: string; value?: string }) => item.label && item.value && !isProhibitedSensitiveItem({ label: item.label, value: item.value }))
            : [],
          stateCode: inferSupportedStateCode(extracted) ?? "",
          diagnosisCategory: inferDiagnosisCategory({
            diagnosis: extracted.diagnosis,
            referralReason: referral.referralReason,
            orderName: referral.orderName,
            receivingProviderSpecialty: referral.receivingProviderSpecialty,
          }) || (extracted.diagnosisCategory === "unknown" ? "" : extracted.diagnosisCategory) || "",
        };
      } catch {
        throw new Error("The scanner could not produce valid structured information.");
      }
    }),
});
