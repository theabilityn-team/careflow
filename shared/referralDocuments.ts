export type DiagnosisCategory = "oncology" | "hematology" | "";
export type DocumentCategory = "referral_order" | "referral_form" | "regular";

export type ReferralData = {
  referralDate: string;
  referralReason: string;
  orderName: string;
  urgency: string;
  appointmentInstructions: string;
  requestedVisits: string;
  authorizationNumber: string;
  authorizationStatus: string;
  authorizationStartDate: string;
  authorizationEndDate: string;
  insuranceCarrier: string;
  insurancePlan: string;
  memberId: string;
  groupNumber: string;
  policyHolder: string;
  referringProviderName: string;
  referringProviderCredentials: string;
  referringProviderPractice: string;
  referringProviderSpecialty: string;
  referringProviderNpi: string;
  referringProviderPhone: string;
  referringProviderFax: string;
  referringProviderAddress: string;
  receivingProviderName: string;
  receivingProviderPractice: string;
  receivingProviderSpecialty: string;
  receivingProviderNpi: string;
  receivingProviderPhone: string;
  receivingProviderFax: string;
  receivingProviderAddress: string;
  icdCodes: string[];
  cptCodes: string[];
};

export type AdditionalInformationItem = {
  section?: string;
  label: string;
  value: string;
  confidence?: number;
};

export const EMPTY_REFERRAL_DATA: ReferralData = {
  referralDate: "",
  referralReason: "",
  orderName: "",
  urgency: "",
  appointmentInstructions: "",
  requestedVisits: "",
  authorizationNumber: "",
  authorizationStatus: "",
  authorizationStartDate: "",
  authorizationEndDate: "",
  insuranceCarrier: "",
  insurancePlan: "",
  memberId: "",
  groupNumber: "",
  policyHolder: "",
  referringProviderName: "",
  referringProviderCredentials: "",
  referringProviderPractice: "",
  referringProviderSpecialty: "",
  referringProviderNpi: "",
  referringProviderPhone: "",
  referringProviderFax: "",
  referringProviderAddress: "",
  receivingProviderName: "",
  receivingProviderPractice: "",
  receivingProviderSpecialty: "",
  receivingProviderNpi: "",
  receivingProviderPhone: "",
  receivingProviderFax: "",
  receivingProviderAddress: "",
  icdCodes: [],
  cptCodes: [],
};

function normalized(value?: string | null) {
  return (value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function inferDiagnosisCategory(input: {
  diagnosis?: string | null;
  referralReason?: string | null;
  orderName?: string | null;
  receivingProviderSpecialty?: string | null;
}): DiagnosisCategory {
  const diagnosis = normalized(input.diagnosis);
  const context = normalized([input.referralReason, input.orderName, input.receivingProviderSpecialty].filter(Boolean).join(" "));
  const oncology = /\b(cancer|carcinoma|malignan\w*|oncolog\w*|neoplasm|tumou?r|metasta\w*|chemotherap\w*|radiation)\b/;
  const hematology = /\b(hematolog\w*|anemia|iron deficiency|neutropenia|leukopenia|thrombocytopenia|pancytopenia|lymphoma|leukemia|myeloma|coagulation|blood disorder)\b/;
  if (oncology.test(diagnosis)) return "oncology";
  if (hematology.test(diagnosis)) return "hematology";
  if (oncology.test(context) && !hematology.test(context)) return "oncology";
  if (hematology.test(context)) return "hematology";
  return "";
}

function row(section: string, label: string, value?: string | null): AdditionalInformationItem | null {
  const clean = value?.trim();
  return clean ? { section, label, value: clean } : null;
}

export function isProhibitedSensitiveItem(item: Pick<AdditionalInformationItem, "label" | "value">) {
  const label = normalized(item.label);
  return /\b(ssn|social security|social security number)\b/.test(label)
    || /\b\d{3}-\d{2}-\d{4}\b/.test(item.value);
}

export function buildReferralAdditionalInformation(input: {
  documentCategory?: DocumentCategory | string | null;
  sex?: string | null;
  medicalRecordNumber?: string | null;
  referral?: Partial<ReferralData> | null;
  additionalInformation?: AdditionalInformationItem[] | null;
}) {
  const referral = { ...EMPTY_REFERRAL_DATA, ...(input.referral ?? {}) };
  const generated = [
    row("Document", "Document type", input.documentCategory?.replaceAll("_", " ")),
    row("Patient", "Sex", input.sex),
    row("Patient", "Medical record number", input.medicalRecordNumber),
    row("Insurance", "Insurance carrier", referral.insuranceCarrier),
    row("Insurance", "Insurance plan", referral.insurancePlan),
    row("Insurance", "Member ID", referral.memberId),
    row("Insurance", "Group number", referral.groupNumber),
    row("Insurance", "Policy holder", referral.policyHolder),
    row("Referral", "Referral date", referral.referralDate),
    row("Referral", "Reason for referral", referral.referralReason),
    row("Referral", "Order name", referral.orderName),
    row("Referral", "Urgency / priority", referral.urgency),
    row("Referral", "Appointment instructions", referral.appointmentInstructions),
    row("Referral", "Requested / authorized visits", referral.requestedVisits),
    row("Authorization", "Authorization number", referral.authorizationNumber),
    row("Authorization", "Authorization status", referral.authorizationStatus),
    row("Authorization", "Authorization start date", referral.authorizationStartDate),
    row("Authorization", "Authorization end date", referral.authorizationEndDate),
    row("Codes", "ICD codes", referral.icdCodes.join(", ")),
    row("Codes", "CPT / HCPCS codes", referral.cptCodes.join(", ")),
    row("Referring provider", "Provider", referral.referringProviderName),
    row("Referring provider", "Credentials", referral.referringProviderCredentials),
    row("Referring provider", "Practice / facility", referral.referringProviderPractice),
    row("Referring provider", "Specialty", referral.referringProviderSpecialty),
    row("Referring provider", "NPI", referral.referringProviderNpi),
    row("Referring provider", "Phone", referral.referringProviderPhone),
    row("Referring provider", "Fax", referral.referringProviderFax),
    row("Referring provider", "Address", referral.referringProviderAddress),
    row("Receiving provider", "Provider", referral.receivingProviderName),
    row("Receiving provider", "Practice / facility", referral.receivingProviderPractice),
    row("Receiving provider", "Specialty", referral.receivingProviderSpecialty),
    row("Receiving provider", "NPI", referral.receivingProviderNpi),
    row("Receiving provider", "Phone", referral.receivingProviderPhone),
    row("Receiving provider", "Fax", referral.receivingProviderFax),
    row("Receiving provider", "Address", referral.receivingProviderAddress),
  ].filter((item): item is AdditionalInformationItem => Boolean(item));

  const seen = new Set(generated.map(item => `${normalized(item.label)}\u0000${normalized(item.value)}`));
  for (const item of input.additionalInformation ?? []) {
    if (!item.label?.trim() || !item.value?.trim()) continue;
    if (isProhibitedSensitiveItem(item)) continue;
    const key = `${normalized(item.label)}\u0000${normalized(item.value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    generated.push({ ...item, section: item.section || "Other extracted information" });
  }
  return generated;
}

export function isReferralDocument(category?: string | null) {
  return category === "referral_order" || category === "referral_form";
}

export function inferStoredDocumentType(additionalInformation?: string | null, fileNames: string[] = []) {
  const evidence: string[] = [...fileNames];
  if (additionalInformation) {
    try {
      const parsed = JSON.parse(additionalInformation) as Array<{ label?: string; value?: string }>;
      for (const item of parsed) {
        if (/document|form|record|source/i.test(item.label ?? "")) evidence.push(item.value ?? "");
      }
    } catch {
      evidence.push(additionalInformation);
    }
  }
  const text = normalized(evidence.join(" "));
  if (/referral[\s_-]*order/.test(text)) return "referral_order" as const;
  if (/referral|authorization[\s_-]*form/.test(text)) return "referral_form" as const;
  return "regular" as const;
}
