import { describe, expect, it } from "vitest";
import { DEFAULT_TECHNICAL_PERMISSIONS, normalizePermissions, PERMISSION_KEYS } from "./permissions";

describe("permission normalization", () => {
  it("fails closed for missing and non-boolean permission values", () => {
    const result = normalizePermissions({ viewLeads: true, exportData: "yes" });
    expect(result.viewLeads).toBe(true);
    expect(result.exportData).toBe(false);
    expect(result.viewClinical).toBe(false);
    expect(Object.keys(result)).toHaveLength(PERMISSION_KEYS.length);
  });

  it("uses least-privilege defaults for sensitive operations", () => {
    expect(DEFAULT_TECHNICAL_PERMISSIONS.scanDocuments).toBe(false);
    expect(DEFAULT_TECHNICAL_PERMISSIONS.viewClinical).toBe(false);
    expect(DEFAULT_TECHNICAL_PERMISSIONS.exportData).toBe(false);
    expect(DEFAULT_TECHNICAL_PERMISSIONS.viewLeads).toBe(true);
  });
});
