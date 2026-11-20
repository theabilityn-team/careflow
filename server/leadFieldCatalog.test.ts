import { describe, expect, it } from "vitest";
import { additionalItemPermissionKeys, canEditLeadField, canViewAdditionalItem, canViewLeadField, canViewUnredactedDocuments, fieldKeyForAdditionalItem, getLeadFieldMode, LEAD_FIELD_DEFINITIONS, LEAD_FIELD_KEYS, normalizeLeadFields } from "../shared/leadFieldPermissions";
import { maskLeadFieldsForDisplay } from "../client/src/lib/leadFieldDisplay";
const access = { role: "technical_staff", isActive: true, permissions: { viewLeads: true, viewClinical: true, viewDocuments: true, editLeads: true, changeStatus: true, manageContacts: true }, leadFields: normalizeLeadFields(undefined) };
describe("lead-information permission catalog", () => {
  it("provides unique canonical keys for contact, clinical and every supplied screenshot title", () => {
    expect(new Set(LEAD_FIELD_KEYS).size).toBe(LEAD_FIELD_KEYS.length);
    for (const key of ["firstName", "lastName", "email", "phone", "address", "dateOfBirth", "diagnosis", "clinicalNotes", "sourceDocumentType", "patient.sex", "patient.medical_record_number", "insurance.insurer", "care_team.attending_physician", "facility.facility", "appointments.next_md_visit", "vitals.height", "vitals.weight", "vitals.bsa", "vitals.height_weight_bsa"]) expect(LEAD_FIELD_KEYS).toContain(key);
    expect(LEAD_FIELD_DEFINITIONS.every(field => field.group && field.label)).toBe(true);
  });
  it("maps OCR letter case and common synonyms to the same clinical title", () => {
    expect(fieldKeyForAdditionalItem({ section: "PATIENT", label: "Gender" })).toBe("patient.sex");
    expect(fieldKeyForAdditionalItem({ section: "Patient", label: "MRN" })).toBe("patient.medical_record_number");
    expect(fieldKeyForAdditionalItem({ section: "Insurance", label: "Insurance carrier" })).toBe("insurance.insurer");
    expect(fieldKeyForAdditionalItem({ section: "Care team", label: "Attending Physician" })).toBe("care_team.attending_physician");
    expect(fieldKeyForAdditionalItem({ section: "Appointments", label: "Next MD Visit" })).toBe("appointments.next_md_visit");
    expect(fieldKeyForAdditionalItem({ section: "Vitals", label: "Height / Weight / BSA" })).toBe("vitals.height_weight_bsa");
    expect(fieldKeyForAdditionalItem({ label: "Email" })).toBe("email");
  });
  it("requires both exact row permission and its canonical alias permission", () => {
    const row = { section: "Hospital encounter", label: "Facility" };
    expect(additionalItemPermissionKeys(row)).toEqual(["facility.facility", "hospital_encounter.facility"]);
    expect(canViewAdditionalItem({ ...access, leadFields: { ...access.leadFields, "facility.facility": "hide" } }, row)).toBe(false);
    expect(canViewAdditionalItem({ ...access, leadFields: { ...access.leadFields, "hospital_encounter.facility": "hide" } }, row)).toBe(false);
  });
  it("preserves explicit false feature upper bounds and defaults old absent maps", () => {
    expect(getLeadFieldMode({ ...access, leadFields: undefined }, "email")).toBe("edit");
    expect(getLeadFieldMode({ ...access, permissions: { ...access.permissions, editLeads: false } }, "email")).toBe("view");
    expect(canViewLeadField({ ...access, permissions: { ...access.permissions, viewClinical: false } }, "patient.sex")).toBe(false);
    expect(canEditLeadField({ ...access, permissions: { ...access.permissions, changeStatus: false } }, "status")).toBe(false);
    expect(getLeadFieldMode(access, "lastContactAt")).toBe("view");
  });
  it("denies malformed explicit maps or modes without re-enabling them", () => {
    for (const raw of [null, false, "invalid", []]) expect(Object.values(normalizeLeadFields(raw)).every(mode => mode === "hide")).toBe(true);
    expect(normalizeLeadFields({ email: false }).email).toBe("hide");
    expect(getLeadFieldMode({ ...access, leadFields: { email: "invalid" } }, "email")).toBe("hide");
    expect(getLeadFieldMode({ ...access, leadFields: null }, "email")).toBe("hide");
  });
  it("blocks raw documents when any source information is hidden, while keeping explicit Super Admin bypass", () => {
    expect(canViewUnredactedDocuments(access)).toBe(true);
    expect(canViewUnredactedDocuments({ ...access, leadFields: { ...access.leadFields, email: "hide" } })).toBe(false);
    expect(canViewUnredactedDocuments({ ...access, role: "super_admin", leadFields: null })).toBe(true);
  });
  it("masks stale cached lead values, aliases and unknown free text without mutating source cache", () => {
    const original = { firstName: "PRIVATE_NAME", email: "PRIVATE_EMAIL", city: "PRIVATE_CITY", address: "PRIVATE_ADDRESS", additionalInformation: JSON.stringify([{ section: "Patient", label: "Sex", value: "Visible" }, { label: "Email", value: "PRIVATE_EMAIL_ALIAS" }, { label: "Patient memo", value: "PRIVATE_FREE_TEXT" }]) };
    const restricted = { ...access, leadFields: { ...access.leadFields, firstName: "hide", email: "hide", address: "hide" } };
    const safe = maskLeadFieldsForDisplay(original, restricted);
    expect(JSON.stringify(safe)).not.toContain("PRIVATE_");
    expect(safe.additionalInformation).toContain("Visible");
    expect(original.firstName).toBe("PRIVATE_NAME");
  });
  it("a combined Height/Weight/BSA row cannot expose a separately hidden vital", () => {
    const composite = { section: "Vitals", label: "Height / Weight / BSA" };
    expect(canViewAdditionalItem({ ...access, leadFields: { ...access.leadFields, "vitals.height": "hide" } }, composite)).toBe(false);
  });

  it("cannot reveal a hidden insurer through primary or secondary carrier aliases", () => {
    for (const section of ["Primary insurance", "Secondary insurance"]) {
      const carrier = { section, label: "Carrier" };
      expect(additionalItemPermissionKeys(carrier)).toContain("insurance.insurer");
      expect(canViewAdditionalItem({ ...access, leadFields: { ...access.leadFields, "insurance.insurer": "hide" } }, carrier)).toBe(false);
    }
  });

});
