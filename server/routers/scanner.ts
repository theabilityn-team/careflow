import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  extractScannerImages,
  normalizeScannerExtraction,
  SCANNER_SYSTEM_PROMPT,
  scannerExtractionSchema,
} from "../scannerExtraction";
import { protectedProcedure, router } from "../_core/trpc";
import { assertPermission } from "../permissions";

export { normalizeScannerExtraction, SCANNER_SYSTEM_PROMPT, scannerExtractionSchema } from "../scannerExtraction";

const fileSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataUrl: z.string().max(45_000_000),
});

export const scannerRouter = router({
  extract: protectedProcedure
    .input(z.object({ files: z.array(fileSchema).min(1).max(6) }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "scanDocuments");
      await assertPermission(ctx.user, "viewClinical");
      try {
        return await extractScannerImages(input.files);
      } catch (error) {
        if (error instanceof Error && error.message === "A document has an invalid file encoding.") {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),
});
