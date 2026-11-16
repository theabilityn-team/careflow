import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EasternClock, { easternClockValue } from "../client/src/components/crm/EasternClock";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("CareFlow logo Eastern clock", () => {
  it("shows the Eastern date and seconds with EST regardless of machine timezone", () => {
    vi.stubEnv("TZ", "Asia/Tokyo");
    expect(easternClockValue(Date.parse("2026-11-17T00:16:25Z"))).toEqual({ date: "Nov 16, 2026", time: "7:16:25 PM EST", iso: "2026-11-17T00:16:25.000Z" });
  });
  it("uses EDT in summer and changes accurately at both DST boundaries", () => {
    expect(easternClockValue(Date.parse("2027-03-14T06:59:59Z")).time).toBe("1:59:59 AM EST");
    expect(easternClockValue(Date.parse("2027-03-14T07:00:00Z")).time).toBe("3:00:00 AM EDT");
    expect(easternClockValue(Date.parse("2027-11-07T05:59:59Z")).time).toBe("1:59:59 AM EDT");
    expect(easternClockValue(Date.parse("2027-11-07T06:00:00Z")).time).toBe("1:00:00 AM EST");
  });
  it("rolls over at Eastern midnight rather than UTC midnight", () => {
    expect(easternClockValue(Date.parse("2026-11-17T04:59:59Z")).date).toBe("Nov 16, 2026");
    expect(easternClockValue(Date.parse("2026-11-17T05:00:00Z")).date).toBe("Nov 17, 2026");
  });
  it("renders an accessible non-live time element without network or staff-activity semantics", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-17T00:16:25Z"));
    const html = renderToStaticMarkup(React.createElement(EasternClock));
    expect(html).toMatch(/datetime="2026-11-17T00:16:25.000Z"/i);
    expect(html).toContain("Nov 16, 2026"); expect(html).toContain("7:16:25 PM EST");
    expect(html).toContain("Eastern Time"); expect(html).not.toContain("aria-live");
  });
});
