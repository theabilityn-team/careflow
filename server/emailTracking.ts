import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ENV } from "./_core/env";

export const DEFAULT_EMAIL_TRACKING_ORIGIN = "https://carecrm-ajn4jvsk.manus.space";
export const EMAIL_TRACKING_PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

function trackingSecret() {
  return ENV.cookieSecret || "careflow-email-tracking-development-only";
}

function normalizeOrigin(value?: string) {
  const candidate = value?.trim() || process.env.CAREFLOW_PUBLIC_URL?.trim() || DEFAULT_EMAIL_TRACKING_ORIGIN;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
    return url.origin;
  } catch {
    return DEFAULT_EMAIL_TRACKING_ORIGIN;
  }
}

function signClick(token: string, target: string) {
  return createHmac("sha256", trackingSecret()).update(`${token}\0${target}`).digest("base64url");
}

function escapeAttribute(value: string) {
  return value.replace(/[&"<>]/g, character => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[character]!);
}

function decodeAttribute(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function safeHttpTarget(value: string) {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function createEmailTrackingToken() {
  return randomBytes(32).toString("hex");
}

export function emailOpenTrackingUrl(token: string, origin?: string) {
  return `${normalizeOrigin(origin)}/api/email-track/open/${encodeURIComponent(token)}.gif`;
}

export function emailClickTrackingUrl(token: string, target: string, origin?: string) {
  const encodedTarget = Buffer.from(target, "utf8").toString("base64url");
  const signature = signClick(token, target);
  return `${normalizeOrigin(origin)}/api/email-track/click/${encodeURIComponent(token)}?u=${encodeURIComponent(encodedTarget)}&s=${encodeURIComponent(signature)}`;
}

export function verifyTrackedClick(token: string, encodedTarget: string, signature: string) {
  if (!/^[a-f0-9]{64}$/i.test(token) || !encodedTarget || !signature) return null;
  try {
    const target = Buffer.from(encodedTarget, "base64url").toString("utf8");
    const safeTarget = safeHttpTarget(target);
    if (!safeTarget || safeTarget !== target) return null;
    const expected = Buffer.from(signClick(token, target));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    return target;
  } catch {
    return null;
  }
}

export function instrumentEmailHtml(html: string, token: string, origin?: string) {
  const withTrackedLinks = html.replace(/href\s*=\s*(["'])(https?:\/\/[^"']+)\1/gi, (attribute, quote: string, encodedHref: string) => {
    const target = safeHttpTarget(decodeAttribute(encodedHref));
    if (!target) return attribute;
    return `href=${quote}${escapeAttribute(emailClickTrackingUrl(token, target, origin))}${quote}`;
  });
  const pixelUrl = escapeAttribute(emailOpenTrackingUrl(token, origin));
  return `${withTrackedLinks}<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;margin:0;padding:0" aria-hidden="true">`;
}
