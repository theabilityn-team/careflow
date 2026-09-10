import { describe, expect, it } from "vitest";
import { inferSupportedStateCode } from "../shared/leadClassification";

describe("supported lead state inference", () => {
  it.each([
    ["Florida", "FL"],
    ["FL", "FL"],
    ["Arizona", "AZ"],
    ["NV", "NV"],
    ["California", "CA"],
  ])("maps %s to %s", (stateProvince, expected) => {
    expect(inferSupportedStateCode({ stateProvince })).toBe(expected);
  });

  it("finds a state inside a complete address", () => {
    expect(inferSupportedStateCode({ address: "1348 Avon Ln, North Lauderdale, Florida 33068" })).toBe("FL");
    expect(inferSupportedStateCode({ address: "20 Market St, Las Vegas, NV 89101" })).toBe("NV");
  });

  it("uses supported ZIP ranges when the state text is missing", () => {
    expect(inferSupportedStateCode({ postalCode: "90210" })).toBe("CA");
    expect(inferSupportedStateCode({ postalCode: "85001" })).toBe("AZ");
  });

  it("does not guess unsupported or ambiguous states", () => {
    expect(inferSupportedStateCode({ stateProvince: "Texas", postalCode: "73301" })).toBeNull();
    expect(inferSupportedStateCode({ address: "Main Street" })).toBeNull();
  });
});
