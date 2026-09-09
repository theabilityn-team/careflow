import { describe, expect, it } from "vitest";
import { hashPassword, normalizeIdentifier, verifyPassword } from "./auth";

describe("local authentication", () => {
  it("loads the configured Super Admin secret and hashes it securely", async () => {
    const password = process.env.SUPER_ADMIN_PASSWORD;
    expect(password).toBeTruthy();
    expect(password!.length).toBeGreaterThanOrEqual(10);
    const credential = await hashPassword(password!);
    expect(credential.hash).not.toContain(password!);
    expect(await verifyPassword(password!, credential.salt, credential.hash)).toBe(true);
    expect(await verifyPassword(`${password!}x`, credential.salt, credential.hash)).toBe(false);
  });

  it("normalizes staff email and Super Admin identifiers", () => {
    expect(normalizeIdentifier("  ADMIN ")).toBe("admin");
    expect(normalizeIdentifier(" Staff@Example.COM ")).toBe("staff@example.com");
  });
});
