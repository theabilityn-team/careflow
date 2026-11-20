import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { normalizeLeadFields } from "../shared/leadFieldPermissions";
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), access: vi.fn(), canAccess: vi.fn(), getDb: vi.fn() }));
vi.mock("./auth", () => ({ authenticateRequest: mocks.authenticate }));
vi.mock("./db", () => ({ canAccessLead: mocks.canAccess, getDb: mocks.getDb }));
vi.mock("./permissions", () => ({ getUserAccess: mocks.access, hasGlobalLeadAccess: (access: any) => access.role === "super_admin" || Boolean(access.isActive && access.isLeader) }));
import { authorizeStoredLeadDocument, findStoredLeadDocument } from "./leadDocumentAccess";
const req = { headers: {} } as Request;
const staff = { id: 7, role: "user" };
const access = { role: "technical_staff", isActive: true, isLeader: false, permissions: { viewLeads: true, viewClinical: true, viewDocuments: true, editLeads: false }, leadFields: normalizeLeadFields(undefined) };
beforeEach(() => { vi.clearAllMocks(); mocks.authenticate.mockResolvedValue(staff); mocks.access.mockResolvedValue(access); mocks.canAccess.mockResolvedValue(true); });
describe("source document current principal authorization", () => {
  it("denies unauthenticated requests and revoked master permissions before lead ACL", async () => {
    mocks.authenticate.mockResolvedValue(null);
    expect(await authorizeStoredLeadDocument(req, 12)).toBe(false);
    mocks.authenticate.mockResolvedValue(staff);
    for (const permission of ["viewLeads", "viewClinical", "viewDocuments"]) {
      mocks.access.mockResolvedValue({ ...access, permissions: { ...access.permissions, [permission]: false } });
      expect(await authorizeStoredLeadDocument(req, 12)).toBe(false);
    }
    expect(mocks.canAccess).not.toHaveBeenCalled();
  });
  it("permits a view-only staff member's accessible original and denies an unrelated lead", async () => {
    expect(await authorizeStoredLeadDocument(req, 12)).toBe(true);
    expect(mocks.canAccess).toHaveBeenCalledWith(12, 7, false);
    mocks.canAccess.mockResolvedValue(false);
    expect(await authorizeStoredLeadDocument(req, 13)).toBe(false);
  });
  it("a hidden contact field blocks originals even for a global Leader", async () => {
    mocks.access.mockResolvedValue({ ...access, isLeader: true, leadFields: { ...access.leadFields, email: "hide" } });
    expect(await authorizeStoredLeadDocument(req, 12)).toBe(false);
    expect(mocks.canAccess).not.toHaveBeenCalled();
  });
  it("Super Admin bypass is explicit; an admin-initiated impersonation still uses the staff target", async () => {
    mocks.authenticate.mockResolvedValue({ ...staff, impersonation: { actor: { id: -1, role: "admin" } } });
    mocks.access.mockResolvedValue({ ...access, leadFields: { ...access.leadFields, "patient.sex": "hide" } });
    expect(await authorizeStoredLeadDocument(req, 12)).toBe(false);
    mocks.authenticate.mockResolvedValue({ id: -1, role: "admin" });
    mocks.access.mockResolvedValue({ ...access, role: "super_admin", leadFields: null });
    expect(await authorizeStoredLeadDocument(req, 12)).toBe(true);
    expect(mocks.canAccess).toHaveBeenCalledWith(12, -1, true);
  });
  it("fails closed if no database or a case-collation mismatch makes object ownership uncertain", async () => {
    mocks.getDb.mockResolvedValue(null);
    await expect(findStoredLeadDocument("leads/12/original.png")).rejects.toThrow("Document access unavailable");
    const chain: any = { from: () => chain, where: () => chain, limit: async () => [{ id: 1, leadId: 12, mimeType: "image/png", fileKey: "leads/12/Original.png" }] };
    mocks.getDb.mockResolvedValue({ select: () => chain });
    await expect(findStoredLeadDocument("leads/12/original.png")).rejects.toThrow("Document access unavailable");
  });
});
