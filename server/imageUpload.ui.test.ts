import { describe, expect, it } from "vitest";
import { convertedImageName, isHeicInput, isSupportedImageInput, MAX_SOURCE_IMAGE_BYTES } from "../client/src/lib/imageUpload";

const file = (name: string, type = "", size = 1) => ({ name, type, size }) as File;

describe("image upload preparation", () => {
  it("accepts native iPhone HEIC and HEIF by MIME type or extension", () => {
    expect(isHeicInput(file("IMG_1001.HEIC"))).toBe(true);
    expect(isHeicInput(file("photo", "image/heif"))).toBe(true);
    expect(isSupportedImageInput(file("IMG_1001.HEIC"))).toBe(true);
  });

  it("continues to accept JPG, PNG, and WebP and rejects unrelated files", () => {
    const iphoneJpeg = file("IMG_2026.JPG", "image/jpeg", 6_700_000);
    expect(isSupportedImageInput(iphoneJpeg)).toBe(true);
    expect(isHeicInput(iphoneJpeg)).toBe(false);
    expect(iphoneJpeg.size).toBeLessThan(MAX_SOURCE_IMAGE_BYTES);
    expect(isSupportedImageInput(file("scan.PNG"))).toBe(true);
    expect(isSupportedImageInput(file("scan.webp", "image/webp"))).toBe(true);
    expect(isSupportedImageInput(file("notes.pdf", "application/pdf"))).toBe(false);
  });

  it("uses a 25 MB source limit and a safe JPEG name after conversion", () => {
    expect(MAX_SOURCE_IMAGE_BYTES).toBe(25_000_000);
    expect(convertedImageName("IMG_1234.HEIC")).toBe("IMG_1234.jpg");
  });
});
