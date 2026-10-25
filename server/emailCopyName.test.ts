import { describe, expect, it } from "vitest";
import { nextEmailCopyName } from "../client/src/lib/emailTemplateEditor";

describe("email library copy names", () => {
  it("adds a copy suffix", () => {
    expect(nextEmailCopyName("MB Aura", ["MB Aura"])).toBe("MB Aura (copy)");
  });
  it("avoids occupied names case-insensitively including archived entries", () => {
    expect(nextEmailCopyName("Welcome", ["Welcome", "WELCOME (COPY)", "Welcome (copy 2)"])).toBe("Welcome (copy 3)");
  });
  it("keeps repeated copies readable", () => {
    expect(nextEmailCopyName("Welcome (copy 2)", ["Welcome", "Welcome (copy)", "Welcome (copy 2)"])).toBe("Welcome (copy 3)");
  });
  it("keeps long names within the database limit and preserves the suffix", () => {
    const result = nextEmailCopyName("A".repeat(160), []);
    expect(result).toHaveLength(160);
    expect(result.endsWith(" (copy)")).toBe(true);
    expect(nextEmailCopyName("A".repeat(160), [result])).toHaveLength(160);
  });
  it("only considers names supplied for the selected destination", () => {
    expect(nextEmailCopyName("Offer", ["Other message"])).toBe("Offer (copy)");
  });
});
