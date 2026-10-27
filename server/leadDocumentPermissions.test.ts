import { afterEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ADMIN_ACTOR_ID } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";

const now = new Date("2026-10-27T00:00:00Z");
const staff = {
  id: 17,
  openId: "staff:17",
  name: "Staff Member",
  email: "staff@example.com",
  loginMethod: "local",
  role: "user" as const,
  createdAt: now,
  updatedAt: now,
  lastSignedIn: now,
};
const admin = {
  id: SYSTEM_ADMIN_ACTOR_ID,
  openId: "system:admin",
  name: "Super Administrator",
  email: "admin@admin.com",
  loginMethod: "local",
  role: "admin" as const,
  createdAt: now,
  updatedAt: now,
  lastSignedIn: now,
};

const sourceDocument = {
  id: 9,
  leadId: 42,
  fileName: "referral-page-1.png",
  mimeType: "image/png",
  fileKey: "leads/42/referral-page-1.png",
  fileUrl: "https://storage.example/referral-page-1.png",
  uploadedBy: staff.id,
  createdAt: now,
};

function context(user: typeof staff | typeof admin = staff): TrpcContext {
  return { user, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function grant(flags: Record<string, boolean>) {
  vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue({
    userId: staff.id,
    jobTitle: "Technical Staff",
    isActive: true,
    preferredLanguage: "en",
    permissions: JSON.stringify(flags),
    createdAt: now,
    updatedAt: now,
  });
}

function mockLead() {
  vi.spyOn(db, "getLead").mockResolvedValue({
    lead: {
      id: 42,
      diagnosis: "Protected diagnosis",
      clinicalNotes: "Protected notes",
      additionalInformation: "Protected information",
    } as never,
    documents: [sourceDocument] as never,
    communications: [],
    followUps: [],
    auditEvents: [],
  } as never);
}

afterEach(() => vi.restoreAllMocks());

describe("lead source-document permissions", () => {
  it("shows clinical text but not source documents when only clinical access is granted", async () => {
    grant({ viewLeads: true, viewClinical: true, viewDocuments: false });
    mockLead();

    const result = await appRouter.createCaller(context()).leads.get({ id: 42 });

    expect(result.lead).toMatchObject({ diagnosis: "Protected diagnosis", clinicalNotes: "Protected notes" });
    expect(result.documents).toEqual([]);
  });

  it("does not expose source documents or clinical text when only document access is granted", async () => {
    grant({ viewLeads: true, viewClinical: false, viewDocuments: true });
    mockLead();

    const result = await appRouter.createCaller(context()).leads.get({ id: 42 });

    expect(result.lead).toMatchObject({ diagnosis: null, clinicalNotes: null, additionalInformation: null });
    expect(result.documents).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("referral-page-1.png");
    expect(JSON.stringify(result)).not.toContain("https://storage.example");
    expect(JSON.stringify(result)).not.toContain("leads/42/");
  });

  it("shows source documents only when both document and clinical access are granted", async () => {
    grant({ viewLeads: true, viewClinical: true, viewDocuments: true });
    mockLead();

    const result = await appRouter.createCaller(context()).leads.get({ id: 42 });

    expect(result.documents).toEqual([sourceDocument]);
    expect(result.lead).toMatchObject({ diagnosis: "Protected diagnosis" });
  });

  it("gives Super Admin full document and clinical access through shared permission keys", async () => {
    mockLead();

    const result = await appRouter.createCaller(context(admin)).leads.get({ id: 42 });

    expect(result.documents).toEqual([sourceDocument]);
    expect(result.lead).toMatchObject({ diagnosis: "Protected diagnosis" });
    expect(db.getLead).toHaveBeenCalledWith(42, { userId: admin.id, isSuperAdmin: true });
  });

  it("does not let Leader status bypass either explicit document or clinical permission", async () => {
    grant({ manageSales: true, viewLeads: false, viewClinical: false, viewDocuments: false });
    mockLead();

    const result = await appRouter.createCaller(context()).leads.get({ id: 42 });

    expect(result.documents).toEqual([]);
    expect(result.lead).toMatchObject({ diagnosis: null, clinicalNotes: null, additionalInformation: null });
    expect(db.getLead).toHaveBeenCalledWith(42, { userId: staff.id, isSuperAdmin: true });
  });
});
