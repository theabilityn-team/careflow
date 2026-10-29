import { describe, expect, it } from "vitest";

const enabled = process.env.RUN_MANUS_SYNC_CREDENTIALS_TEST === "1";

describe("Manus System sync credentials (explicit read-only validation)", () => {
  it.skipIf(!enabled)("authenticates and has an installed Google Drive connector", async () => {
    const key = process.env.MANUS_SYNC_API_KEY;
    if (!key?.trim()) throw new Error("The required MANUS_SYNC_API_KEY secret is missing.");
    const headers = { "x-manus-api-key": key, accept: "application/json" };
    const account = await fetch("https://api.manus.ai/v2/user.me", { headers, signal: AbortSignal.timeout(15000) });
    if (!account.ok) throw new Error("Manus API key validation failed. Create a valid key in Manus Developers settings.");
    const identity = await account.json();
    expect(identity.ok, "Manus authentication must succeed").toBe(true);
    const response = await fetch("https://api.manus.ai/v2/connector.list", { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Manus connector access could not be verified.");
    const body = await response.json();
    expect(body.ok).toBe(true);
    const drive = (body.data ?? []).find((item: { id: string; name: string }) => item.id === "f8900a57-4bd7-46cc-83a3-5ebd2420a817" || /google drive/i.test(item.name));
    expect(Boolean(drive), "Connect Google Drive in the same Manus account that owns this API key").toBe(true);
  }, 40000);
});
