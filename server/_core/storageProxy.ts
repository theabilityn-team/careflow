import type { Express } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ENV } from "./env";
import { authorizeStoredLeadDocument, findStoredLeadDocument, isReservedLeadStorageKey } from "../leadDocumentAccess";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    res.set("Cache-Control", "private, no-store, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("X-Content-Type-Options", "nosniff");
    if (!key || key.length > 2048 || /[\\\x00-\x1f]/.test(key) || key.split("/").some(part => part === "." || part === "..")) {
      res.status(400).send("Invalid storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(503).send("Storage unavailable");
      return;
    }
    try {
      const document = await findStoredLeadDocument(key);
      // Unknown keys in source-document namespaces are never public, including orphaned uploads.
      if (document ? !await authorizeStoredLeadDocument(req, document.leadId) : isReservedLeadStorageKey(key)) {
        res.status(404).send("Document not found");
        return;
      }
      const forgeUrl = new URL("v1/storage/presign/get", ENV.forgeApiUrl.replace(/\/+$/, "") + "/");
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!forgeResp.ok) {
        res.status(502).send("Storage backend unavailable");
        return;
      }
      const payload: unknown = await forgeResp.json();
      const signed = payload && typeof payload === "object" ? (payload as { url?: unknown }).url : undefined;
      if (typeof signed !== "string" || new URL(signed).protocol !== "https:") {
        res.status(502).send("Storage backend unavailable");
        return;
      }
      if (!document) {
        // Non-CRM assets retain their normal redirect behavior. Lead files never expose signed URLs.
        res.redirect(307, signed);
        return;
      }
      const bytes = await fetch(signed, { signal: AbortSignal.timeout(60_000) });
      if (!bytes.ok || !bytes.body) {
        res.status(502).send("Document unavailable");
        return;
      }
      const mime = /^(?:image\/(?:jpeg|png|webp|heic|heif)|application\/pdf)$/.test(document.mimeType) ? document.mimeType : "application/octet-stream";
      res.set("Content-Type", mime);
      // Do not reveal the patient-derived original filename in response headers.
      res.set("Content-Disposition", "inline");
      await pipeline(Readable.fromWeb(bytes.body as any), res);
    } catch {
      // Fail closed. Never log upstream payloads, object keys, signed URLs, or medical filenames.
      if (!res.headersSent) res.status(503).send("Storage temporarily unavailable");
      else res.destroy();
    }
  });
}
