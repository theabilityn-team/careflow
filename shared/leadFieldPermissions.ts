import { LEAD_INFORMATION_ROWS } from "./leadInformationRows";

export const LEAD_FIELD_MODES = ["hide", "view", "edit"] as const;
export type LeadFieldMode = (typeof LEAD_FIELD_MODES)[number];
export type LeadFieldPermissions = Record<string, LeadFieldMode>;
export const LEAD_FIELD_DEFINITIONS = [
  { key: "firstName", label: "First name", group: "Contact information", clinical: false },
  { key: "lastName", label: "Last name", group: "Contact information", clinical: false },
  { key: "email", label: "Email", group: "Contact information", clinical: false },
  { key: "phone", label: "Phone", group: "Contact information", clinical: false },
  { key: "address", label: "Address (street, city, province, postal code, country)", group: "Contact information", clinical: false },
  { key: "dateOfBirth", label: "Date of birth", group: "Contact information", clinical: false },
  { key: "preferredLanguage", label: "Lead language", group: "Classification and pipeline", clinical: false },
  { key: "stateCode", label: "Operational state", group: "Classification and pipeline", clinical: false },
  { key: "diagnosisCategory", label: "Diagnosis group", group: "Protected clinical information", clinical: true },
  { key: "diagnosis", label: "Diagnosis", group: "Protected clinical information", clinical: true },
  { key: "clinicalNotes", label: "Clinical notes", group: "Protected clinical information", clinical: true },
  { key: "sourceDocumentType", label: "Document type", group: "Document", clinical: false },
  { key: "status", label: "Business status", group: "Classification and pipeline", clinical: false },
  { key: "interestLevel", label: "Interest signal", group: "Classification and pipeline", clinical: false },
  { key: "assignedTo", label: "Assigned staff", group: "Classification and pipeline", clinical: false },
  { key: "lastContactAt", label: "Most recent contact", group: "Classification and pipeline", clinical: false, readOnly: true },
  { key: "nextFollowUpAt", label: "Next follow-up", group: "Classification and pipeline", clinical: false },
  ...LEAD_INFORMATION_ROWS.filter(row => row.key !== "document.document_type"),
  { key: "otherInformation", label: "Other / unclassified extracted information", group: "Other information", clinical: true },
] as const;
export const LEAD_FIELD_KEYS: string[] = LEAD_FIELD_DEFINITIONS.map(field => field.key);
const definitions = new Map<string, (typeof LEAD_FIELD_DEFINITIONS)[number]>(LEAD_FIELD_DEFINITIONS.map(field => [field.key, field]));
const slug = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Missing field settings inherit existing feature permissions; explicit invalid values deny. */
export function normalizeLeadFields(value: unknown): LeadFieldPermissions {
  if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value))) return Object.fromEntries(LEAD_FIELD_KEYS.map(key => [key, "hide"])) as LeadFieldPermissions;
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(LEAD_FIELD_KEYS.map(key => [key, !Object.hasOwn(source, key) ? "edit" : LEAD_FIELD_MODES.includes(source[key] as LeadFieldMode) ? source[key] : "hide"])) as LeadFieldPermissions;
}
export type LeadFieldAccess = {
  role?: string;
  isActive?: boolean;
  permissions?: Partial<Record<string, boolean>>;
  leadFields?: unknown;
};
export function fieldKeyForLeadProperty(property: string): string | undefined {
  if (["address", "city", "stateProvince", "postalCode", "country"].includes(property)) return "address";
  if (property === "assignedStaff") return "assignedTo";
  if (["leadFirstName", "customerFirstName"].includes(property)) return "firstName";
  if (["leadLastName", "customerLastName"].includes(property)) return "lastName";
  if (["leadEmail", "customerEmail", "recipientEmail"].includes(property)) return "email";
  if (["leadPhone", "customerPhone"].includes(property)) return "phone";
  return definitions.has(property) ? property : undefined;
}
export function getLeadFieldMode(access: LeadFieldAccess | null | undefined, key: string): LeadFieldMode {
  if (access?.role === "super_admin") return "edit";
  if (!access || access.isActive === false || access.permissions?.viewLeads === false) return "hide";
  const definition = definitions.get(key);
  if (!definition) return "hide";
  if (definition.clinical && access.permissions?.viewClinical !== true) return "hide";
  const raw = access.leadFields;
  if (raw !== undefined && (!raw || typeof raw !== "object" || Array.isArray(raw))) return "hide";
  const settings = (raw ?? {}) as Record<string, unknown>;
  const mode = !Object.hasOwn(settings, key) ? "edit" : LEAD_FIELD_MODES.includes(settings[key] as LeadFieldMode) ? settings[key] as LeadFieldMode : "hide";
  if (mode === "hide") return "hide";
  if ("readOnly" in definition && definition.readOnly) return "view";
  const editPermission = key === "status" ? "changeStatus" : key === "nextFollowUpAt" ? "manageContacts" : "editLeads";
  if (mode === "edit" && access.permissions?.[editPermission] !== true) return "view";
  return mode;
}
export const canViewLeadField = (access: LeadFieldAccess | null | undefined, key: string) => getLeadFieldMode(access, key) !== "hide";
export const canEditLeadField = (access: LeadFieldAccess | null | undefined, key: string) => getLeadFieldMode(access, key) === "edit";
export const hasHiddenLeadFields = (access: LeadFieldAccess | null | undefined) => LEAD_FIELD_KEYS.some(key => !canViewLeadField(access, key));
/** Raw documents cannot be selectively redacted. Do not expose them if any information is hidden. */
export const canViewUnredactedDocuments = (access: LeadFieldAccess | null | undefined) => access?.role === "super_admin" || Boolean(access?.permissions?.viewDocuments && access?.permissions?.viewClinical && !hasHiddenLeadFields(access));

/** Match both canonical sections and common OCR synonyms, independent of letter case. */
export function fieldKeyForAdditionalItem(item: { section?: string; label: string }): string {
  const section = slug(item.section || "");
  const label = slug(item.label);
  if (label === "document_type" || label === "source_document_type") return "sourceDocumentType";
  if (/^(diagnosis|diagnoses|admit_diagnosis|principal_diagnosis|other_diagnoses|icd_codes|icd_10_codes|icd_10|reason_for_referral|visit_reason)$/.test(label)) return "diagnosis";
  if (/^(clinical_notes|medical_notes)$/.test(label)) return "clinicalNotes";
  if (/^(date_of_birth|dob|birth_date)$/.test(label)) return "dateOfBirth";
  if (/^(sex|gender)$/.test(label)) return "patient.sex";
  if (/^(medical_record_number|mrn|medical_record_no)$/.test(label)) return "patient.medical_record_number";
  if (/^(insurer|insurance_carrier|insurance_provider|carrier)$/.test(label) && (label !== "carrier" || /insurance/.test(section))) return "insurance.insurer";
  if (/^(plan|insurance_plan)$/.test(label) && /insurance/.test(section)) return "insurance.insurance_plan";
  if (label === "attending_physician" || label === "attending_md") return "care_team.attending_physician";
  if (label === "facility" || label === "facility_name") return "facility.facility";
  if (/^(next_md_visit|next_doctor_visit|next_physician_visit)$/.test(label)) return "appointments.next_md_visit";
  if (/^(height|weight|bsa|height_weight_bsa)$/.test(label)) return `vitals.${label}`;
  if (!section || section === "patient_contact" || /^(contact|contact_information|patient|patient_information|demographics)$/.test(section)) {
    if (/^(email|email_address)$/.test(label)) return "email";
    if (/^(phone|telephone|cell_phone|alternate_phone|mobile_phone|phone_number)$/.test(label)) return "phone";
    if (/^(address|street_address|city|state_province|postal_code|zip_code|country)$/.test(label)) return "address";
    if (label === "first_name") return "firstName";
    if (label === "last_name") return "lastName";
  }
  const exact = `${section}.${label}`;
  if (definitions.has(exact)) return exact;
  // Unique labels tolerate OCR's inconsistent section headings without silently moving data to Other.
  const matching = LEAD_FIELD_DEFINITIONS.filter(field => slug(field.label) === label);
  return matching.length === 1 ? matching[0].key : "otherInformation";
}

/** Some structured aliases contain the same information as a canonical contact/clinical field. */
export function additionalItemPermissionKeys(item: { section?: string; label: string }): string[] {
  const canonical = fieldKeyForAdditionalItem(item);
  const exact = `${slug(item.section || "")}.${slug(item.label)}`;
  const compositeKeys = canonical === "vitals.height_weight_bsa" ? ["vitals.height", "vitals.weight", "vitals.bsa"] : [];
  return Array.from(new Set([canonical, ...(definitions.has(exact) ? [exact] : []), ...compositeKeys]));
}
export const canViewAdditionalItem = (access: LeadFieldAccess | null | undefined, item: { section?: string; label: string }) => additionalItemPermissionKeys(item).every(key => canViewLeadField(access, key));
export const canEditAdditionalItem = (access: LeadFieldAccess | null | undefined, item: { section?: string; label: string }) => additionalItemPermissionKeys(item).every(key => canEditLeadField(access, key));
