import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import { protectedProcedure, router } from "../_core/trpc";
import { assertPermission } from "../permissions";
import { inferSupportedStateCode } from "../../shared/leadClassification";

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
    address: { type: "string" },
    city: { type: "string" },
    stateProvince: { type: "string" },
    stateCode: { type: "string", enum: ["FL", "AZ", "NV", "CA", ""] },
    postalCode: { type: "string" },
    country: { type: "string" },
    diagnosis: { type: "string" },
    clinicalNotes: { type: "string" },
    documentTypes: { type: "array", items: { type: "string" } },
    additionalInformation: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          value: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["label", "value", "confidence"],
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
    "address",
    "city",
    "stateProvince",
    "stateCode",
    "postalCode",
    "country",
    "diagnosis",
    "clinicalNotes",
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
              "You extract customer and clinical information from document images. Read all images as one case. Copy only visible facts; never invent missing information. Use empty strings when a field is absent. Preserve diagnostic wording accurately. Put every other useful fact in additionalInformation. Set stateCode to FL, AZ, NV, or CA when the visible state, address, or ZIP code clearly identifies Florida, Arizona, Nevada, or California; otherwise use an empty string. Flag ambiguous, conflicting, or low-confidence values in reviewWarnings. The output will always be reviewed by authorized staff before saving.",
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

      const content = response.choices[0]?.message.content;
      if (typeof content !== "string") throw new Error("The scanner returned an unexpected response.");
      try {
        const extracted = JSON.parse(content);
        return { ...extracted, stateCode: inferSupportedStateCode(extracted) ?? "" };
      } catch {
        throw new Error("The scanner could not produce valid structured information.");
      }
    }),
});
