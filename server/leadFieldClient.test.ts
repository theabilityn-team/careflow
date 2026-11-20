import { maskMailMessageForDisplay } from "../client/src/lib/leadFieldDisplay";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  buildLeadFieldPatch,
  confirmLeadFieldSave,
  createLeadFieldSaveGuard,
} from "../client/src/lib/leadFieldEditor";
import { maskLeadFieldsForDisplay } from "../client/src/lib/leadFieldDisplay";
import { normalizeLeadFields } from "../shared/leadFieldPermissions";
import { refreshPermissionQueries } from "../client/src/lib/accessRefresh";

const allLeadFields = () => normalizeLeadFields(undefined);
const access = (overrides: Record<string, unknown> = {}) => ({
  role: "technical_staff",
  isActive: true,
  permissions: {
    viewLeads: true,
    viewClinical: true,
    viewDocuments: true,
    editLeads: true,
    changeStatus: true,
    manageContacts: true,
  },
  leadFields: { ...allLeadFields(), ...overrides },
});

describe("granular lead-field client behavior", () => {
  it("builds a changed-only top-level patch and excludes hidden/view-only fields", () => {
    const before = {
      firstName: "Ada",
      email: "old@example.test",
      phone: "555-0100",
      diagnosis: "restricted",
      clinicalNotes: "restricted notes",
      status: "new",
    };
    const after = {
      ...before,
      firstName: "Ada changed",
      email: "new@example.test",
      phone: "555-0199",
      diagnosis: "changed restricted",
      clinicalNotes: "changed restricted notes",
      status: "qualified",
    };
    const patch = buildLeadFieldPatch(
      before,
      after,
      access({ firstName: "view", phone: "view", diagnosis: "hide", clinicalNotes: "hide" }),
    );

    expect(patch).toEqual({ email: "new@example.test", status: "qualified" });
    expect(patch).not.toHaveProperty("firstName");
    expect(patch).not.toHaveProperty("phone");
    expect(patch).not.toHaveProperty("diagnosis");
    expect(patch).not.toHaveProperty("clinicalNotes");
  });

  it("targets a changed second same-label row by occurrence and excludes hidden/view rows", () => {
    const initialRows = [
      { section: "Hospital encounter", label: "Facility", value: "North clinic" },
      { section: "Hospital encounter", label: "Facility", value: "South clinic" },
      { section: "Other", label: "Free memo", value: "old memo" },
      { section: "Patient", label: "Sex", value: "X" },
    ];
    const draftRows = [
      initialRows[0],
      { ...initialRows[1], value: "South clinic changed" },
      { ...initialRows[2], value: "new memo" },
      { ...initialRows[3], value: "Y" },
    ];
    const patch = buildLeadFieldPatch(
      {},
      {},
      access({
        "facility.facility": "edit",
        "hospital_encounter.facility": "edit",
        otherInformation: "view",
        "patient.sex": "view",
      }),
      initialRows,
      draftRows,
    );

    expect(JSON.parse(String(patch.additionalInformation))).toEqual([
      {
        section: "Hospital encounter",
        label: "Facility",
        _occurrence: 1,
        value: "South clinic changed",
      },
    ]);
  });

  it("confirms only a complete, well-formed server catalog and rejects partial or malformed responses", () => {
    const expected = { email: "view", phone: "edit" } as const;
    const full = { ...allLeadFields(), ...expected };

    expect(confirmLeadFieldSave(expected, { success: true, leadFields: full })).toEqual(full);
    expect(confirmLeadFieldSave(expected, { success: true, appliedAccess: { leadFields: full } })).toEqual(full);
    expect(() => confirmLeadFieldSave(expected, { success: true, leadFields: { email: "view", phone: "edit" } })).toThrow(
      "could not be verified",
    );
    expect(() => confirmLeadFieldSave(expected, { success: true, leadFields: null })).toThrow("could not be verified");
    expect(() => confirmLeadFieldSave(expected, { success: true, leadFields: { ...allLeadFields(), email: "invalid" } })).toThrow(
      "could not be verified",
    );
    expect(() => confirmLeadFieldSave(expected, { success: true })).toThrow("could not be verified");
  });

  it("suppresses synchronous duplicate saves before React can repaint and unlocks after failure", async () => {
    const guard = createLeadFieldSaveGuard();
    let release!: () => void;
    const save = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));

    const first = guard(save);
    expect(await guard(save)).toBeUndefined();
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await first;

    await expect(guard(async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    await expect(guard(async () => "retry")).resolves.toBe("retry");
  });

  it("masks stale cached values and structured aliases before display", () => {
    const original = {
      firstName: "STALE_NAME",
      email: "STALE_EMAIL",
      diagnosis: "STALE_DIAGNOSIS",
      nextFollowUpAt: 999,
      additionalInformation: JSON.stringify([
        { section: "Patient", label: "Sex", value: "VISIBLE_SEX" },
        { section: "Clinical", label: "Diagnosis", value: "STALE_ROW_DIAGNOSIS" },
        { label: "unclassified secret", value: "STALE_FREE_TEXT" },
      ]),
    };
    const safe = maskLeadFieldsForDisplay(original, access({ email: "hide", firstName: "hide", diagnosis: "hide", "patient.sex": "view" }));

    expect(JSON.stringify(safe)).not.toContain("STALE_");
    expect(safe.firstName).toBe("");
    expect(safe.email).toBeNull();
    expect(safe.diagnosis).toBeNull();
    expect(safe.additionalInformation).toContain("VISIBLE_SEX");
    expect(original.firstName).toBe("STALE_NAME");
  });

  it("clears protected cached queries while retaining auth/access identities", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const identity = [["auth", "me"], { type: "query" }] as const;
    const accessQuery = [["dashboard", "access"], { type: "query" }] as const;
    const protectedLead = [["leads", "get"], { input: { id: 42 }, type: "query" }] as const;
    client.setQueryData(identity, { id: 1 });
    client.setQueryData(accessQuery, { role: "technical_staff" });
    client.setQueryData(protectedLead, { lead: { email: "STALE_EMAIL" } });

    await refreshPermissionQueries(client);

    expect(client.getQueryData(identity)).toEqual({ id: 1 });
    expect(client.getQueryData(accessQuery)).toEqual({ role: "technical_staff" });
    expect(client.getQueryData(protectedLead)).toBeUndefined();
    client.clear();
  });
});

describe("stale mail field masking", () => {
  it("withholds old message bodies, recipients and tracked URLs while preserving delivery metadata", () => {
    const source = { recipientName: "PRIVATE_NAME", recipientEmail: "PRIVATE_EMAIL", subject: "PRIVATE_SUBJECT", bodyHtml: "PRIVATE_BODY", ccEmails: ["PRIVATE_CC"], trackedLinks: ["PRIVATE_URL"], status: "sent", productName: "Public product" };
    const safe = maskMailMessageForDisplay(source, { role: "technical_staff", isActive: true, permissions: { viewLeads: true, viewClinical: true }, leadFields: { firstName: "hide", email: "hide" } });
    expect(JSON.stringify(safe)).not.toContain("PRIVATE_");
    expect(safe.status).toBe("sent"); expect(safe.productName).toBe("Public product"); expect(source.subject).toBe("PRIVATE_SUBJECT");
    expect(maskMailMessageForDisplay(source, { role: "super_admin" })).toBe(source);
  });
});
