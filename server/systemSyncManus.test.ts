import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync, createSign } from "node:crypto";
import { callbackHash, createCallbackSecret, discoveryPrompt, importPrompt, manusRequest, validateSyncBaseUrl, verifyCallbackToken, verifyManusWebhook } from "./systemSyncManus";
afterEach(() => vi.unstubAllGlobals());
describe("System sync provider safeguards", () => {
  it("hashes scoped bearer tokens and rejects replayed wrong values", () => {
    const secret = createCallbackSecret();
    expect(secret.hash).not.toContain(secret.token);
    expect(verifyCallbackToken(secret.token, secret.hash)).toBe(true);
    expect(verifyCallbackToken(secret.token + "x", secret.hash)).toBe(false);
    expect(verifyCallbackToken("a", secret.hash)).toBe(false);
    expect(callbackHash(secret.token)).toHaveLength(64);
  });
  it("accepts only known HTTPS app origins, no localhost/credentials/queries", () => {
    expect(validateSyncBaseUrl("https://carecrm-ajn4jvsk.manus.space")).toBe("https://carecrm-ajn4jvsk.manus.space");
    for (const url of ["http://carecrm-ajn4jvsk.manus.space", "https://127.0.0.1", "https://a.manus.space/secret", "https://user:pass@a.manus.space", "https://a.manus.space?x=1", "https://a.manus.space.evil.com"]) expect(() => validateSyncBaseUrl(url)).toThrow();
  });
  it("never grants arbitrary sources, writes, compression or patient extraction to the bridge", () => {
    const input = { jobId: 12, callbackBase: "https://a.manus.space", token: "scoped-dummy-token", rootFolderId: "root" };
    expect(discoveryPrompt(input)).toContain("NEVER download pixels in discovery");
    expect(discoveryPrompt(input)).toContain("DO NOT send success=true");
    expect(importPrompt(input)).toContain("ONLY the assigned item IDs");
    expect(importPrompt(input)).toContain("no compression before OCR");
    expect(importPrompt(input)).not.toContain(process.env.MANUS_SYNC_API_KEY || "unavailable-api-secret");
  });
  it("does not retry ambiguous paid task creation or expose upstream body", async () => {
    vi.stubEnv("MANUS_SYNC_API_KEY", "dummy-key");
    const fetch = vi.fn().mockRejectedValue(new Error("contains private upstream response")); vi.stubGlobal("fetch", fetch);
    await expect(manusRequest("task.create", {})).rejects.toMatchObject({ uncertain: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(manusRequest("user.me")).rejects.not.toThrow("private upstream");
    vi.unstubAllEnvs();
  });
  it("verifies exact raw-body/url RSA signatures and freshness", () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const body = Buffer.from('{"event_type":"task_stopped"}'); const url = "https://a.manus.space/api/system-sync/webhook"; const timestamp = String(Math.floor(Date.now()/1000));
    const signature = createSign("RSA-SHA256").update(`${timestamp}.${url}.${createHash("sha256").update(body).digest("hex")}`).sign(privateKey,"base64");
    const input = {publicKey: publicKey.export({type:"spki",format:"pem"}).toString(),body,url,timestamp,signature};
    expect(verifyManusWebhook(input)).toBe(true);
    expect(verifyManusWebhook({...input,body:Buffer.from("changed")})).toBe(false);
    expect(verifyManusWebhook({...input,url:url+"?spoof=1"})).toBe(false);
    expect(verifyManusWebhook({...input,now:Date.now()+301_000})).toBe(false);
  });
});
