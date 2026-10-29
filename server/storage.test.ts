import { afterEach, describe, expect, it, vi } from "vitest";
import { storagePut } from "./storage";

vi.mock("./_core/env", () => ({ ENV: { forgeApiUrl: "https://forge.example.invalid", forgeApiKey: "TEST_SECRET" } }));

const presigned = () => new Response(JSON.stringify({ url: "https://storage.example.invalid/private?signature=TEST_SIGNATURE" }), { status: 200 });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("bounded server storage", () => {
  it("uses Node crypto without global Web Crypto and preserves exact original bytes", async () => {
    vi.stubGlobal("crypto", undefined);
    const request = vi.fn().mockResolvedValueOnce(presigned()).mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", request);
    const bytes = Buffer.from([255, 216, 1, 2, 3, 4]);
    const result = await storagePut("/system-sync/example/original.jpg", bytes, "image/jpeg");
    expect(result.key).toMatch(/^system-sync\/example\/original_[a-f0-9]{8}\.jpg$/);
    expect(result.url).toBe(`/manus-storage/${result.key}`);
    expect(request).toHaveBeenCalledTimes(2);
    const upload = request.mock.calls[1][1];
    expect(upload.headers).toEqual({ "Content-Type": "image/jpeg" });
    expect(Buffer.from(await upload.body.arrayBuffer())).toEqual(bytes);
    expect(request.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(upload.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([["storage_presign", 403], ["storage_upload", 500]] as const)("reports only safe %s HTTP metadata", async (stage, status) => {
    const bad = new Response("PRIVATE_TOKEN_AND_PATIENT_DATA", { status });
    const readBody = vi.spyOn(bad, "text");
    const request = vi.fn();
    if (stage === "storage_upload") request.mockResolvedValueOnce(presigned());
    request.mockResolvedValueOnce(bad);
    vi.stubGlobal("fetch", request);
    await expect(storagePut("example.jpg", Buffer.from([1]))).rejects.toMatchObject({ stage, code: "http", httpStatus: status, message: expect.not.stringContaining("PRIVATE") });
    expect(readBody).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(stage === "storage_upload" ? 2 : 1);
  });

  it("does not expose the URL or key from network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("PRIVATE_URL?token=TEST_SECRET")));
    await expect(storagePut("example.jpg", Buffer.from([1]))).rejects.toMatchObject({ stage: "storage_presign", code: "network", message: "Storage URL request failed (network)." });
  });

  it.each([{}, { url: "http://insecure.example.invalid" }, { url: "PRIVATE_TOKEN" }])("rejects malformed or insecure presigned responses without leaking content", async body => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    vi.stubGlobal("fetch", request);
    await expect(storagePut("example.jpg", Buffer.from([1]))).rejects.toMatchObject({ stage: "storage_presign", code: "invalid_response", message: "Storage URL request failed (invalid_response)." });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([["storage_presign", 15_000], ["storage_upload", 60_000]] as const)("aborts %s at its deadline without retries", async (stage, deadline) => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("PRIVATE_URL", "TimeoutError")), ms);
      return controller.signal;
    });
    const request = vi.fn();
    if (stage === "storage_upload") request.mockResolvedValueOnce(presigned());
    request.mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true })));
    vi.stubGlobal("fetch", request);
    const promise = expect(storagePut("example.jpg", Buffer.from([1]))).rejects.toMatchObject({ stage, code: "timeout", message: expect.not.stringContaining("PRIVATE") });
    await vi.advanceTimersByTimeAsync(deadline);
    await promise;
    expect(request).toHaveBeenCalledTimes(stage === "storage_upload" ? 2 : 1);
  });
});
