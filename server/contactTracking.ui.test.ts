import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "../client/src/lib/clipboard";
import { followUpTimingLabel, getFollowUpTiming } from "../client/src/lib/contactTracking";

describe("contact tracking helpers", () => {
  it("classifies absent, overdue, and scheduled follow-ups", () => {
    const now = 1_800_000;
    expect(getFollowUpTiming(null, now)).toBe("none");
    expect(getFollowUpTiming(now - 1, now)).toBe("overdue");
    expect(getFollowUpTiming(now, now)).toBe("scheduled");
    expect(getFollowUpTiming(now + 1, now)).toBe("scheduled");
  });

  it("provides clear English timing labels", () => {
    expect(followUpTimingLabel("none")).toBe("No reminder scheduled");
    expect(followUpTimingLabel("overdue")).toBe("Follow-up overdue");
    expect(followUpTimingLabel("scheduled")).toBe("Follow-up scheduled");
  });
});

describe("copyText", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the secure Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await copyText("person@example.com");
    expect(writeText).toHaveBeenCalledWith("person@example.com");
  });

  it("rejects empty values before touching the clipboard", async () => {
    await expect(copyText("")).rejects.toThrow("Nothing to copy.");
  });
});
