import { describe, expect, it } from "vitest";
import { hasSuperLoginParameter } from "../client/src/lib/loginMode";

describe("hidden Super Admin login mode", () => {
  it("is not enabled on the normal login URL", () => {
    expect(hasSuperLoginParameter("")).toBe(false);
    expect(hasSuperLoginParameter("?next=%2Fleads")).toBe(false);
  });

  it("is enabled only when the super-login parameter is explicitly present", () => {
    expect(hasSuperLoginParameter("?super-login")).toBe(true);
    expect(hasSuperLoginParameter("?super-login=1")).toBe(true);
    expect(hasSuperLoginParameter("?next=%2F&super-login=private")).toBe(true);
  });

  it("does not match similar parameter names", () => {
    expect(hasSuperLoginParameter("?superLogin=1")).toBe(false);
    expect(hasSuperLoginParameter("?super-login-enabled=1")).toBe(false);
  });
});
