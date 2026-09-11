import { describe, expect, it } from "vitest";
import { leadUpdateFields } from "./routers/leads";

describe("lead partial update schema", () => {
  it("does not inject interestLevel when only status changes", () => {
    const parsed = leadUpdateFields.parse({ status: "qualified" });
    expect(parsed).toEqual({ status: "qualified" });
    expect(parsed).not.toHaveProperty("interestLevel");
    expect(parsed).not.toHaveProperty("preferredLanguage");
  });

  it("does not inject status when only interestLevel changes", () => {
    const parsed = leadUpdateFields.parse({ interestLevel: "hot" });
    expect(parsed).toEqual({ interestLevel: "hot" });
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("preferredLanguage");
  });

  it("keeps an empty patch empty", () => {
    expect(leadUpdateFields.parse({})).toEqual({});
  });
});
