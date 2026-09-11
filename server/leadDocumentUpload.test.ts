import { describe, expect, it } from "vitest";
import { MAX_LEAD_DOCUMENT_BATCH_BYTES, MAX_LEAD_DOCUMENT_BYTES, prepareLeadDocuments } from "./routers/leads";

function documentOfSize(size: number, name = "iphone-photo.jpeg") {
  return {
    name,
    mimeType: "image/jpeg" as const,
    dataUrl: `data:image/jpeg;base64,${Buffer.alloc(size, 1).toString("base64")}`,
  };
}

describe("lead document save validation", () => {
  it("accepts a typical 6.7 MB iPhone JPEG during duplicate-check and create", () => {
    const [prepared] = prepareLeadDocuments([documentOfSize(6_700_000, "IMG_7952.jpeg")]);
    expect(prepared.bytes).toHaveLength(6_700_000);
  });

  it("accepts one image at the full 25 MB boundary", () => {
    const [prepared] = prepareLeadDocuments([documentOfSize(MAX_LEAD_DOCUMENT_BYTES)]);
    expect(prepared.bytes).toHaveLength(MAX_LEAD_DOCUMENT_BYTES);
  });

  it("rejects an image larger than 25 MB with the corrected message", () => {
    expect(() => prepareLeadDocuments([documentOfSize(MAX_LEAD_DOCUMENT_BYTES + 1, "too-large.jpeg")]))
      .toThrow("too-large.jpeg exceeds 25 MB.");
  });

  it("keeps the full-quality per-lead request below the 32 MB transport boundary", () => {
    const first = Math.floor(MAX_LEAD_DOCUMENT_BATCH_BYTES / 2);
    expect(() => prepareLeadDocuments([
      documentOfSize(first, "page-1.jpeg"),
      documentOfSize(MAX_LEAD_DOCUMENT_BATCH_BYTES - first + 1, "page-2.jpeg"),
    ])).toThrow("The selected images exceed 32 MB together.");
  });
});
