import type { Express } from "express";
import { recordOutboundEmailClick, recordOutboundEmailOpen } from "./db";
import { EMAIL_TRACKING_PIXEL, verifyTrackedClick } from "./emailTracking";

export type EmailTrackingRouteDependencies = {
  recordOpen: (trackingToken: string, occurredAt?: number) => Promise<void>;
  recordClick: (trackingToken: string, occurredAt?: number) => Promise<void>;
};

const defaultDependencies: EmailTrackingRouteDependencies = {
  recordOpen: recordOutboundEmailOpen,
  recordClick: recordOutboundEmailClick,
};

export function registerEmailTrackingRoutes(app: Express, dependencies = defaultDependencies) {
  app.get("/api/email-track/open/:token.gif", async (req, res) => {
    res.set({
      "Content-Type": "image/gif",
      "Content-Length": String(EMAIL_TRACKING_PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
      "Referrer-Policy": "no-referrer",
    });
    const token = String(req.params.token || "");
    if (/^[a-f0-9]{64}$/i.test(token)) {
      try { await dependencies.recordOpen(token); } catch { /* Always return the invisible pixel. */ }
    }
    return res.status(200).end(EMAIL_TRACKING_PIXEL);
  });

  app.get("/api/email-track/click/:token", async (req, res) => {
    const token = String(req.params.token || "");
    const target = verifyTrackedClick(token, String(req.query.u || ""), String(req.query.s || ""));
    if (!target) return res.status(404).type("text/plain").send("Link unavailable.");
    try { await dependencies.recordClick(token); } catch { /* A database issue must not break the recipient link. */ }
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    return res.redirect(302, target);
  });
}
