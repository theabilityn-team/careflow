import { afterEach, describe, expect, it, vi } from "vitest";
import { looksLikeEmailHtml, preferredTestSenderUserId } from "../client/src/lib/emailTemplateEditor";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";

const now = new Date("2026-09-19T00:00:00Z");
const staff = { id: 17, openId: "staff:17", name: "Staff Member", email: "staff@example.com", loginMethod: "local", role: "user" as const, createdAt: now, updatedAt: now, lastSignedIn: now };
const admin = { id: 1, openId: "system:admin", name: "Super Administrator", email: "admin@admin.com", loginMethod: "system", role: "admin" as const, createdAt: now, updatedAt: now, lastSignedIn: now };
const permissions = { userId: 17, jobTitle: "Technical Staff", isActive: true, preferredLanguage: "en" as const, permissions: JSON.stringify({ viewLeads: true, createLeads: true, editLeads: true, scanDocuments: false, viewClinical: false, manageContacts: true, manageEmails: true, useEmailTemplates: true, changeStatus: true, exportData: false }), createdAt: now, updatedAt: now };

function context(user: typeof staff | typeof admin | null): TrpcContext {
  return { user, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

afterEach(() => vi.restoreAllMocks());

describe("email template editor format detection", () => {
  it("detects pasted full documents and common email HTML blocks", () => {
    expect(looksLikeEmailHtml("<!doctype html><html><body><table><tr><td>Offer</td></tr></table></body></html>")).toBe(true);
    expect(looksLikeEmailHtml('<div style="padding:20px">Hello</div>')).toBe(true);
    expect(looksLikeEmailHtml("Hello {{leadFirstName}},\n\nThis is plain text.")).toBe(false);
  });

  it("prefers a verified enabled SMTP sender and never defaults to a disabled mailbox", () => {
    expect(preferredTestSenderUserId([
      { userId: 1, isActive: true, smtpEnabled: false, smtpVerifiedAt: null },
      { userId: 2, isActive: true, smtpEnabled: true, smtpVerifiedAt: null },
      { userId: 3, isActive: true, smtpEnabled: true, smtpVerifiedAt: 1_790_000_000_000 },
    ])).toBe(3);
    expect(preferredTestSenderUserId([
      { userId: 1, isActive: true, smtpEnabled: false, smtpVerifiedAt: null },
      { userId: 2, isActive: false, smtpEnabled: true, smtpVerifiedAt: 1_790_000_000_000 },
    ])).toBeUndefined();
  });
});

describe("product email template library", () => {
  it("returns only the active library to authorized staff and nests templates by product", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(permissions);
    const products = [{ id: 3, name: "Recovery Mat", description: "Product A", isActive: true, sortOrder: 1, createdBy: 1, updatedBy: 1, createdAt: now, updatedAt: now }];
    const templates = [{ id: 8, productId: 3, productName: "Recovery Mat", productIsActive: true, name: "Initial introduction", description: "First contact", subject: "Hello {{leadFirstName}}", contentMode: "plain" as const, bodyText: "Welcome", bodyHtml: null, sourceFileName: null, isActive: true, sortOrder: 1, createdBy: 1, updatedBy: 1, createdAt: now, updatedAt: now }];
    const listProducts = vi.spyOn(db, "listEmailProducts").mockResolvedValue(products);
    const listTemplates = vi.spyOn(db, "listEmailMessageTemplates").mockResolvedValue(templates);

    const result = await appRouter.createCaller(context(staff)).emailLibrary.library();

    expect(listProducts).toHaveBeenCalledWith(false);
    expect(listTemplates).toHaveBeenCalledWith(false);
    expect(result[0]).toMatchObject({ name: "Recovery Mat", templates: [expect.objectContaining({ name: "Initial introduction" })] });
  });

  it("blocks technical staff from all library management endpoints", async () => {
    const listProducts = vi.spyOn(db, "listEmailProducts");
    await expect(appRouter.createCaller(context(staff)).emailLibrary.adminList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context(staff)).emailLibrary.createProduct({ name: "Blocked", description: null, isActive: true, sortOrder: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(listProducts).not.toHaveBeenCalled();
  });

  it("lets Super Admin create a product and records the administrator actor", async () => {
    const created = { id: 4, name: "MB Aura", description: "Aura product", isActive: true, sortOrder: 2, createdBy: 1, updatedBy: 1, createdAt: now, updatedAt: now };
    const create = vi.spyOn(db, "createEmailProduct").mockResolvedValue(created);

    const result = await appRouter.createCaller(context(admin)).emailLibrary.createProduct({ name: " MB Aura ", description: " Aura product ", isActive: true, sortOrder: 2 });

    expect(result).toEqual(created);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "MB Aura", description: "Aura product", createdBy: 1, updatedBy: 1 }));
  });

  it("lets Super Admin create an active template only under an existing product", async () => {
    vi.spyOn(db, "getEmailProduct").mockResolvedValue({ id: 4, name: "MB Aura", description: null, isActive: true, sortOrder: 0, createdBy: 1, updatedBy: 1, createdAt: now, updatedAt: now });
    const created = { id: 9, productId: 4, productName: "MB Aura", productIsActive: true, name: "Welcome", description: null, subject: "Hello {{leadFirstName}}", contentMode: "plain" as const, bodyText: "Welcome to MB Aura.", bodyHtml: null, sourceFileName: null, isActive: true, sortOrder: 0, createdBy: 1, updatedBy: 1, createdAt: now, updatedAt: now };
    const create = vi.spyOn(db, "createEmailMessageTemplate").mockResolvedValue(created);

    const result = await appRouter.createCaller(context(admin)).emailLibrary.createTemplate({ productId: 4, name: "Welcome", description: null, subject: "Hello {{leadFirstName}}", bodyText: "Welcome to MB Aura.", isActive: true, sortOrder: 0 });

    expect(result).toEqual(created);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ productId: 4, name: "Welcome", createdBy: 1, updatedBy: 1 }));
  });

  it("blocks staff and anonymous users from copying products", async () => {
    const copy = vi.spyOn(db, "createEmailProductWithTemplates");

    await expect(appRouter.createCaller(context(staff)).emailLibrary.copyProduct({
      id: 3,
      product: { name: "Blocked copy", description: null, isActive: true, sortOrder: 0 },
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context(null)).emailLibrary.copyProduct({
      id: 3,
      product: { name: "Blocked anonymous copy", description: null, isActive: true, sortOrder: 0 },
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(copy).not.toHaveBeenCalled();
  });

  it("copies archived plain and HTML templates with edited product metadata and the admin actor", async () => {
    vi.spyOn(db, "getEmailProduct").mockResolvedValue({ id: 3, name: "Original", description: "Original description", isActive: false, sortOrder: 9, createdBy: 42, updatedBy: 43, createdAt: now, updatedAt: now });
    vi.spyOn(db, "listEmailMessageTemplates").mockResolvedValue([
      { id: 8, productId: 3, productName: "Original", productIsActive: false, name: "Plain", description: " Plain description ", subject: "Plain subject", contentMode: "plain", bodyText: "  Plain body  ", bodyHtml: "ignored", sourceFileName: "plain.txt", isActive: false, sortOrder: 4, createdBy: 42, updatedBy: 43, createdAt: now, updatedAt: now },
      { id: 9, productId: 3, productName: "Original", productIsActive: false, name: "HTML", description: "HTML description", subject: "HTML subject", contentMode: "html", bodyText: "stale fallback", bodyHtml: '<div onclick="bad()"><h1>Hello {{leadFirstName}}</h1><script>bad()</script></div>', sourceFileName: "../nested/design.html", isActive: false, sortOrder: 5, createdBy: 42, updatedBy: 43, createdAt: now, updatedAt: now },
    ]);
    const copied = { id: 12, name: "Copied", description: "Edited description", isActive: true, sortOrder: 2, createdBy: 1, updatedBy: 1, createdAt: new Date("2026-09-20T00:00:00Z"), updatedAt: new Date("2026-09-20T00:00:00Z") };
    const copy = vi.spyOn(db, "createEmailProductWithTemplates").mockResolvedValue(copied);

    const result = await appRouter.createCaller(context(admin)).emailLibrary.copyProduct({
      id: 3,
      product: { name: " Copied ", description: " Edited description ", isActive: true, sortOrder: 2 },
    });

    expect(result).toEqual(copied);
    expect(copy).toHaveBeenCalledWith(
      { name: "Copied", description: "Edited description", isActive: true, sortOrder: 2, createdBy: 1, updatedBy: 1 },
      [
        expect.objectContaining({ name: "Plain", description: "Plain description", subject: "Plain subject", contentMode: "plain", bodyText: "Plain body", bodyHtml: null, sourceFileName: "plain.txt", isActive: false, sortOrder: 4, createdBy: 1, updatedBy: 1 }),
        expect.objectContaining({ name: "HTML", description: "HTML description", subject: "HTML subject", contentMode: "html", bodyText: "Hello {{leadFirstName}}", bodyHtml: expect.not.stringContaining("script"), sourceFileName: "design.html", isActive: false, sortOrder: 5, createdBy: 1, updatedBy: 1 }),
      ],
    );
    expect(String(copy.mock.calls[0]?.[1][1]?.bodyHtml)).not.toContain("onclick");
  });

  it("returns NOT_FOUND when the source product is missing and maps DB conflicts", async () => {
    vi.spyOn(db, "getEmailProduct").mockResolvedValue(undefined);
    const copy = vi.spyOn(db, "createEmailProductWithTemplates");
    await expect(appRouter.createCaller(context(admin)).emailLibrary.copyProduct({
      id: 999,
      product: { name: "Missing source copy", description: null, isActive: true, sortOrder: 0 },
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(copy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    vi.spyOn(db, "getEmailProduct").mockResolvedValue({ id: 3, name: "Original", description: null, isActive: true, sortOrder: 0, createdBy: 1, updatedBy: 1, createdAt: now, updatedAt: now });
    vi.spyOn(db, "listEmailMessageTemplates").mockResolvedValue([]);
    vi.spyOn(db, "createEmailProductWithTemplates").mockRejectedValue(Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" }));
    await expect(appRouter.createCaller(context(admin)).emailLibrary.copyProduct({
      id: 3,
      product: { name: "Existing", description: null, isActive: true, sortOrder: 0 },
    })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("maps wrapped Drizzle duplicate errors without masking unrelated failures", async () => {
    vi.spyOn(db, "getEmailProduct").mockResolvedValue({ id: 3, name: "Original", description: null, isActive: true, sortOrder: 0, createdBy: 1, updatedBy: 1, createdAt: now, updatedAt: now });
    vi.spyOn(db, "listEmailMessageTemplates").mockResolvedValue([]);
    const copy = vi.spyOn(db, "createEmailProductWithTemplates").mockRejectedValue(new Error("query failed", { cause: Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" }) }));
    const input = { id: 3, product: { name: "Existing", description: null, isActive: true, sortOrder: 0 } };
    await expect(appRouter.createCaller(context(admin)).emailLibrary.copyProduct(input)).rejects.toMatchObject({ code: "CONFLICT" });
    copy.mockRejectedValue(new Error("connection unavailable"));
    await expect(appRouter.createCaller(context(admin)).emailLibrary.copyProduct(input)).rejects.toThrow("connection unavailable");
  });

  it("sanitizes an uploaded HTML template and derives its text fallback", async () => {
    vi.spyOn(db, "getEmailProduct").mockResolvedValue({ id: 4, name: "MB Aura", description: null, isActive: true, sortOrder: 0, createdBy: 1, updatedBy: 1, createdAt: now, updatedAt: now });
    const create = vi.spyOn(db, "createEmailMessageTemplate").mockImplementation(async input => ({ id: 10, productName: "MB Aura", productIsActive: true, createdAt: now, updatedAt: now, ...input }));

    await appRouter.createCaller(context(admin)).emailLibrary.createTemplate({
      productId: 4,
      name: "Designed welcome",
      description: null,
      subject: "Welcome {{leadFirstName}}",
      contentMode: "html",
      bodyText: "",
      bodyHtml: '<div onclick="bad()"><h1>Welcome {{leadFirstName}}</h1><script>steal()</script></div>',
      sourceFileName: "../welcome.html",
      isActive: true,
      sortOrder: 0,
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      contentMode: "html",
      bodyHtml: expect.not.stringContaining("script"),
      bodyText: "Welcome {{leadFirstName}}",
      sourceFileName: "welcome.html",
    }));
    expect(String(create.mock.calls[0]?.[0].bodyHtml)).not.toContain("onclick");
  });
});
