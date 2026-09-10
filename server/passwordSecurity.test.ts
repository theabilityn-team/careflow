import { describe, expect, it } from "vitest";
import { isPasswordResetUsable, staffPasswordSchema, superAdminPasswordSchema } from "./passwordSecurity";

describe("password security rules", () => {
  it("enforces staff password complexity", () => {
    expect(staffPasswordSchema.safeParse("StrongPass1").success).toBe(true);
    expect(staffPasswordSchema.safeParse("short1A").success).toBe(false);
    expect(staffPasswordSchema.safeParse("alllowercase1").success).toBe(false);
  });

  it("requires a stronger Super Admin password including a symbol", () => {
    expect(superAdminPasswordSchema.safeParse("AdminSecure1!").success).toBe(true);
    expect(superAdminPasswordSchema.safeParse("AdminSecure12").success).toBe(false);
    expect(superAdminPasswordSchema.safeParse("short1!A").success).toBe(false);
  });

  it("accepts only ready, unexpired one-time reset links", () => {
    const now = 1_000_000;
    expect(isPasswordResetUsable("ready", now + 1, now)).toBe(true);
    expect(isPasswordResetUsable("ready", now, now)).toBe(true);
    expect(isPasswordResetUsable("ready", now - 1, now)).toBe(false);
    expect(isPasswordResetUsable("used", now + 1, now)).toBe(false);
    expect(isPasswordResetUsable("pending", null, now)).toBe(false);
  });
});
