import { describe, expect, it } from "vitest";
import { DEFAULT_STAFF_ACCOUNT_PERMISSIONS, matchingStaffAccountPassword, normalizeStaffAccountEmail, validStaffAccountIdentity, validStaffAccountPassword } from "../client/src/lib/staffAccountForms";
import { staffPasswordSchema } from "./passwordSecurity";

describe("staff account form rules", () => {
  it("matches the existing staff password policy", () => {
    for (const value of ["ValidPass1", "short1A", "alllowercase1", "ALLUPPERCASE1", "NoNumbersHere", "A1" + "x".repeat(198), "A1" + "x".repeat(199)]) {
      expect(validStaffAccountPassword(value)).toBe(staffPasswordSchema.safeParse(value).success);
    }
  });
  it("requires an exact valid password confirmation", () => {
    expect(matchingStaffAccountPassword("ValidPass1", "ValidPass1")).toBe(true);
    expect(matchingStaffAccountPassword("ValidPass1", "ValidPass2")).toBe(false);
    expect(matchingStaffAccountPassword("invalid", "invalid")).toBe(false);
    expect(matchingStaffAccountPassword("ValidPass1", "ValidPass1 ")).toBe(false);
  });
  it("normalizes email and rejects blank, invalid, or reserved identities", () => {
    expect(normalizeStaffAccountEmail(" Staff@Example.COM ")).toBe("staff@example.com");
    expect(validStaffAccountIdentity("Technical Staff", " Staff+one@Example.COM ")).toBe(true);
    expect(validStaffAccountIdentity("X", "staff@example.com")).toBe(false);
    expect(validStaffAccountIdentity("Staff", "invalid")).toBe(false);
    expect(validStaffAccountIdentity("Staff", " ADMIN@ADMIN.COM ")).toBe(false);
    expect(validStaffAccountIdentity("Staff", "staff @example.com")).toBe(false);
  });
  it("keeps existing least-privilege defaults for new staff", () => {
    expect(Object.keys(DEFAULT_STAFF_ACCOUNT_PERMISSIONS)).toHaveLength(8);
    expect(DEFAULT_STAFF_ACCOUNT_PERMISSIONS.scanDocuments).toBe(false);
    expect(DEFAULT_STAFF_ACCOUNT_PERMISSIONS.viewClinical).toBe(false);
    expect(DEFAULT_STAFF_ACCOUNT_PERMISSIONS.exportData).toBe(false);
    expect(DEFAULT_STAFF_ACCOUNT_PERMISSIONS.manageContacts).toBe(true);
  });
});
