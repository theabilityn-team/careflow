export const IMAGE_FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";
export const MAX_SOURCE_IMAGE_BYTES = 25_000_000;
export const MAX_SCAN_BATCH_BYTES = 32_000_000;
export const MAX_BULK_SOURCE_BYTES = 100_000_000;

export type PreparedUploadImage = {
  name: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  dataUrl: string;
  size: number;
  originalSize: number;
  convertedFromHeic: boolean;
};

type FileIdentity = Pick<File, "name" | "type" | "size">;

const extension = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export function isHeicInput(file: FileIdentity) {
  return ["image/heic", "image/heif"].includes(file.type.toLowerCase()) || ["heic", "heif"].includes(extension(file.name));
}

export function isSupportedImageInput(file: FileIdentity) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type.toLowerCase()) || ["jpg", "jpeg", "png", "webp"].includes(extension(file.name)) || isHeicInput(file);
}

export function convertedImageName(name: string) {
  const base = name.replace(/\.[^.]+$/, "") || "iphone-photo";
  return `${base}.jpg`;
}

export function totalOriginalBytes(files: Array<Pick<PreparedUploadImage, "originalSize">>) {
  return files.reduce((sum, file) => sum + file.originalSize, 0);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(blob);
  });
}

export async function prepareUploadImage(file: File): Promise<PreparedUploadImage> {
  if (!isSupportedImageInput(file)) throw new Error(`${file.name}: use JPG, PNG, WebP, HEIC, or HEIF.`);
  if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error(`${file.name}: the original photo is larger than 25 MB.`);

  const convertedFromHeic = isHeicInput(file);
  let blob: Blob = file;
  let name = file.name;
  let mimeType = (file.type || (extension(file.name) === "png" ? "image/png" : extension(file.name) === "webp" ? "image/webp" : "image/jpeg")) as PreparedUploadImage["mimeType"];

  // JPEG, PNG, and WebP bytes are sent to OCR unchanged. HEIC/HEIF must be decoded
  // because the vision API does not accept that container; quality 1 preserves the
  // original dimensions and avoids any resize or pre-OCR compression pass.
  if (convertedFromHeic) {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 1 });
    blob = Array.isArray(converted) ? converted[0] : converted;
    name = convertedImageName(file.name);
    mimeType = "image/jpeg";
  }

  return {
    name,
    mimeType,
    dataUrl: await blobToDataUrl(blob),
    size: blob.size,
    originalSize: file.size,
    convertedFromHeic,
  };
}
