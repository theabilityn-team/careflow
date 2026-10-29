// Preconfigured storage helpers for Manus WebDev templates
// Uploads via Forge Server presigned URL to S3 (PUT direct).
// Downloads return /manus-storage/{key} paths served via 307 redirect.

import { randomUUID } from "node:crypto";
import { ENV } from "./_core/env";

export class StorageOperationError extends Error {
  constructor(
    public readonly stage: "storage_presign" | "storage_upload",
    public readonly code: "timeout" | "network" | "http" | "invalid_response",
    public readonly httpStatus?: number,
  ) {
    super(`Storage ${stage === "storage_presign" ? "URL request" : "image upload"} failed (${code}${httpStatus ? `, HTTP ${httpStatus}` : ""}).`);
    this.name = "StorageOperationError";
  }
}

async function storageRequest(stage: "storage_presign" | "storage_upload", url: URL | string, init: RequestInit) {
  const signal = AbortSignal.timeout(stage === "storage_presign" ? 15_000 : 60_000);
  try {
    const response = await fetch(url, { ...init, signal });
    if (!response.ok) throw new StorageOperationError(stage, "http", response.status);
    return response;
  } catch (error) {
    if (error instanceof StorageOperationError) throw error;
    throw new StorageOperationError(stage, signal.aborted ? "timeout" : "network");
  }
}

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY",
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));

  // 1. Get presigned PUT URL from Forge
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await storageRequest("storage_presign", presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  let s3Url: string;
  try {
    const result = await presignResp.json();
    if (typeof result.url !== "string" || new URL(result.url).protocol !== "https:") throw new Error();
    s3Url = result.url;
  } catch (error) {
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    throw new StorageOperationError("storage_presign", timedOut ? "timeout" : "invalid_response");
  }

  // 2. PUT file directly to S3
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  await storageRequest("storage_upload", s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}


export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", normalizeKey(relKey));
  const resp = await storageRequest("storage_presign", getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });
  try {
    const result = await resp.json();
    if (typeof result.url !== "string" || new URL(result.url).protocol !== "https:") throw new Error();
    return result.url;
  } catch (error) {
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    throw new StorageOperationError("storage_presign", timedOut ? "timeout" : "invalid_response");
  }
}
