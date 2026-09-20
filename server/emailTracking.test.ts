import express from "express";
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmailTrackingToken, emailClickTrackingUrl, instrumentEmailHtml, verifyTrackedClick } from "./emailTracking";
import { registerEmailTrackingRoutes } from "./emailTrackingRoutes";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  vi.restoreAllMocks();
});

async function startTrackingServer(recordOpen = vi.fn(async () => {}), recordClick = vi.fn(async () => {})) {
  const app = express();
  registerEmailTrackingRoutes(app, { recordOpen, recordClick });
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Tracking test server did not start.");
  return { origin: `http://127.0.0.1:${address.port}`, recordOpen, recordClick };
}

describe("email engagement tracking", () => {
  it("creates opaque tokens, rewrites safe links, leaves mail links alone, and adds one open pixel", () => {
    const token = createEmailTrackingToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);

    const html = instrumentEmailHtml('<p><a href="https://example.com/offer?a=1&amp;b=2">Offer</a> <a href="mailto:help@example.com">Reply</a></p>', token, "https://care.example.com");
    expect(html).toContain("https://care.example.com/api/email-track/click/");
    expect(html).toContain("https://care.example.com/api/email-track/open/");
    expect(html).toContain('href="mailto:help@example.com"');
    expect(html.match(/api\/email-track\/open/g)).toHaveLength(1);

    const clickHref = html.match(/href="(https:\/\/care\.example\.com\/api\/email-track\/click\/[^\"]+)/)?.[1]?.replaceAll("&amp;", "&");
    expect(clickHref).toBeTruthy();
    const clickUrl = new URL(clickHref!);
    expect(verifyTrackedClick(token, clickUrl.searchParams.get("u")!, clickUrl.searchParams.get("s")!)).toBe("https://example.com/offer?a=1&b=2");
    expect(verifyTrackedClick(token, clickUrl.searchParams.get("u")!, "tampered")).toBeNull();
  });

  it("returns an invisible pixel and records only well-formed tracking tokens", async () => {
    const tracking = await startTrackingServer();
    const token = "a".repeat(64);

    const response = await fetch(`${tracking.origin}/api/email-track/open/${token}.gif`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/gif");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect(tracking.recordOpen).toHaveBeenCalledWith(token);

    await fetch(`${tracking.origin}/api/email-track/open/not-a-token.gif`);
    expect(tracking.recordOpen).toHaveBeenCalledTimes(1);
  });

  it("records a valid signed click and redirects, but rejects tampered targets", async () => {
    const tracking = await startTrackingServer();
    const token = "b".repeat(64);
    const target = "https://example.com/product?campaign=careflow";
    const clickUrl = emailClickTrackingUrl(token, target, tracking.origin);

    const response = await fetch(clickUrl, { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(target);
    expect(tracking.recordClick).toHaveBeenCalledWith(token);

    const tampered = new URL(clickUrl);
    tampered.searchParams.set("s", "tampered");
    const rejected = await fetch(tampered, { redirect: "manual" });
    expect(rejected.status).toBe(404);
    expect(tracking.recordClick).toHaveBeenCalledTimes(1);
  });
});
