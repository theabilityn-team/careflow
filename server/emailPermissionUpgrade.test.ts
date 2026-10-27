import { describe, expect, it } from "vitest";
import { DEFAULT_TECHNICAL_PERMISSIONS, normalizePermissions, upgradeLegacyDocumentPermissions, upgradeLegacyEmailPermissions } from "../shared/permissions";

describe("independent email permissions", () => {
  it("defaults new accounts to no email or template access", () => {
    expect(DEFAULT_TECHNICAL_PERMISSIONS.manageContacts).toBe(true);
    expect(DEFAULT_TECHNICAL_PERMISSIONS.manageEmails).toBe(false);
    expect(DEFAULT_TECHNICAL_PERMISSIONS.useEmailTemplates).toBe(false);
  });
  it("never derives runtime email access from contacts or lead viewing", () => {
    const result = normalizePermissions({ manageContacts: true, viewLeads: true });
    expect(result.manageEmails).toBe(false);
    expect(result.useEmailTemplates).toBe(false);
    expect(normalizePermissions({ manageEmails: true, useEmailTemplates: false }).useEmailTemplates).toBe(false);
    expect(normalizePermissions({ manageEmails: false, useEmailTemplates: true }).manageEmails).toBe(false);
  });
  it("backfills existing missing keys once while preserving all previous fields", () => {
    const old = { manageContacts: true, viewClinical: false, custom: "retained" };
    const upgraded = upgradeLegacyEmailPermissions(old);
    expect(upgraded).toEqual({ ...old, manageEmails: true, useEmailTemplates: true });
    expect(old).not.toHaveProperty("manageEmails");
    expect(upgradeLegacyEmailPermissions(upgraded)).toEqual(upgraded);
  });
  it("never re-enables explicit disabled flags during upgrades or restarts", () => {
    expect(upgradeLegacyEmailPermissions({ manageContacts: true, manageEmails: false, useEmailTemplates: false })).toEqual({ manageContacts: true, manageEmails: false, useEmailTemplates: false });
    expect(upgradeLegacyEmailPermissions({ manageContacts: true, manageEmails: false }).manageEmails).toBe(false);
    expect(upgradeLegacyEmailPermissions({ manageContacts: false }).useEmailTemplates).toBe(false);
  });
  it("treats non-boolean permission values as denied", () => {
    expect(normalizePermissions({ manageEmails: "true", useEmailTemplates: 1 }).manageEmails).toBe(false);
    expect(normalizePermissions({ manageEmails: "true", useEmailTemplates: 1 }).useEmailTemplates).toBe(false);
    expect(normalizePermissions(null).manageEmails).toBe(false);
    expect(normalizePermissions([]).useEmailTemplates).toBe(false);
  });

  it("backfills document access from legacy clinical access exactly once", () => {
    const old = { viewClinical: true, custom: "retained" };
    const upgraded = upgradeLegacyDocumentPermissions(old);
    expect(upgraded).toEqual({ ...old, viewDocuments: true });
    expect(old).not.toHaveProperty("viewDocuments");
    expect(upgradeLegacyDocumentPermissions(upgraded)).toEqual(upgraded);
  });

  it("preserves explicit document denial during upgrades", () => {
    expect(upgradeLegacyDocumentPermissions({ viewClinical: true, viewDocuments: false })).toEqual({ viewClinical: true, viewDocuments: false });
    expect(upgradeLegacyDocumentPermissions({ viewClinical: false, viewDocuments: false })).toEqual({ viewClinical: false, viewDocuments: false });
    expect(upgradeLegacyDocumentPermissions({ viewClinical: "true", viewDocuments: false }).viewDocuments).toBe(false);
  });
});
