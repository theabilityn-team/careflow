import express from "express";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), authorize: vi.fn() }));
vi.mock("./leadDocumentAccess", () => ({
  findStoredLeadDocument: mocks.find,
  authorizeStoredLeadDocument: mocks.authorize,
  isReservedLeadStorageKey: (key: string) => /^(?:leads|direct-import|drive-import|imports|source-documents|originals)(?:\/|$)/i.test(key),
}));
vi.mock("./_core/env", () => ({ ENV: { forgeApiUrl: "https://forge.invalid/", forgeApiKey: "fake-server-key" } }));
import { registerStorageProxy } from "./_core/storageProxy";
const httpFetch = globalThis.fetch;
let server: Server;
let base: string;
let upstream: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.find.mockResolvedValue({ id: 1, leadId: 2, mimeType: "image/png" });
  mocks.authorize.mockResolvedValue(true);
  upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  const app = express();
  registerStorageProxy(app);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
describe("private source-document storage", () => {
  it("denies a copied document URL before any storage request when access is revoked or anonymous", async () => {
    mocks.authorize.mockResolvedValue(false);
    const response = await httpFetch(`${base}/manus-storage/leads/2/source.png`);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Document not found");
    expect(upstream).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("streams identical original bytes without revealing the storage URL or patient filename", async () => {
    const original = Uint8Array.from([137, 80, 78, 71, 0, 0, 255, 1, 2, 3]);
    upstream.mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://objects.invalid/private-signed-token" })))
      .mockResolvedValueOnce(new Response(original));
    const response = await httpFetch(`${base}/manus-storage/leads/2/patient-name.png`);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(original);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(upstream.mock.calls[1]?.[1]).not.toHaveProperty("headers.Authorization");
    expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(), 2);
  });
  it("does not publicly presign orphaned keys in lead namespaces", async () => {
    mocks.find.mockResolvedValue(null);
    expect((await httpFetch(`${base}/manus-storage/leads/999/orphan.png`)).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("fails closed on ACL or database uncertainty without logging keys or upstream bodies", async () => {
    mocks.find.mockRejectedValue(new Error("PRIVATE_MEDICAL_CANARY"));
    const response = await httpFetch(`${base}/manus-storage/unusual-original.png`);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("PRIVATE_MEDICAL_CANARY");
    expect(upstream).not.toHaveBeenCalled();
  });
  it("retains generic non-CRM asset behavior", async () => {
    mocks.find.mockResolvedValue(null);
    upstream.mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://objects.invalid/public-art.png" })));
    const response = await httpFetch(`${base}/manus-storage/public-art.png`, { redirect: "manual" });
    expect(response.status).toBe(307);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it("rejects non-HTTPS or malformed signed responses safely", async () => {
    upstream.mockResolvedValueOnce(new Response(JSON.stringify({ url: "http://unsafe.invalid/raw" })));
    const response = await httpFetch(`${base}/manus-storage/leads/2/source.png`);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("unsafe.invalid");
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
