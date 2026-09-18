export type DiagnosisCategory = "oncology" | "hematology" | "";
export type DocumentCategory = "referral_order" | "referral_form" | "hospital_facesheet_standard" | "hospital_facesheet_extended" | "regular";

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

export type FacesheetData = {
  facilityName: string;
  facilityLocation: string;
  encounterType: string;
  financialAccountNumber: string;
  arrivalDate: string;
  arrivalTime: string;
  admitDate: string;
  admitTime: string;
  dischargeDate: string;
  dischargeTime: string;
  roomBed: string;
  lengthOfStay: string;
  patientLanguage: string;
  race: string;
  religion: string;
  ethnicGroup: string;
  countryOfBirth: string;
  maritalStatus: string;
  occupation: string;
  cellPhone: string;
  alternatePhone: string;
  nextOfKinName: string;
  nextOfKinRelationship: string;
  nextOfKinPhone: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  guarantorName: string;
  guarantorRelationship: string;
  guarantorPhone: string;
  guarantorAddress: string;
  primaryInsuranceCarrier: string;
  primaryInsurancePlan: string;
  primaryMemberId: string;
  primaryGroupNumber: string;
  primaryAuthorizationNumber: string;
  secondaryInsuranceCarrier: string;
  secondaryInsurancePlan: string;
  secondaryMemberId: string;
  secondaryGroupNumber: string;
  attendingPhysician: string;
  emergencyPhysician: string;
  primaryCarePhysician: string;
  referringFacility: string;
  hospitalService: string;
  admitDiagnosis: string;
  visitReason: string;
  principalDiagnosis: string;
  otherDiagnoses: string;
  principalProcedure: string;
  otherProcedures: string;
  icdCodes: string[];
};

export type AdditionalInformationItem = {
  section?: string;
  label: string;
  value: string;
  confidence?: number;
};

export const EMPTY_REFERRAL_DATA: ReferralData = {
  referralDate: "", referralReason: "", orderName: "", urgency: "", appointmentInstructions: "", requestedVisits: "",
  authorizationNumber: "", authorizationStatus: "", authorizationStartDate: "", authorizationEndDate: "",
  insuranceCarrier: "", insurancePlan: "", memberId: "", groupNumber: "", policyHolder: "",
  referringProviderName: "", referringProviderCredentials: "", referringProviderPractice: "", referringProviderSpecialty: "",
  referringProviderNpi: "", referringProviderPhone: "", referringProviderFax: "", referringProviderAddress: "",
  receivingProviderName: "", receivingProviderPractice: "", receivingProviderSpecialty: "", receivingProviderNpi: "",
  receivingProviderPhone: "", receivingProviderFax: "", receivingProviderAddress: "", icdCodes: [], cptCodes: [],
};

export const EMPTY_FACESHEET_DATA: FacesheetData = {
  facilityName: "", facilityLocation: "", encounterType: "", financialAccountNumber: "",
  arrivalDate: "", arrivalTime: "", admitDate: "", admitTime: "", dischargeDate: "", dischargeTime: "", roomBed: "", lengthOfStay: "",
  patientLanguage: "", race: "", religion: "", ethnicGroup: "", countryOfBirth: "", maritalStatus: "", occupation: "",
  cellPhone: "", alternatePhone: "", nextOfKinName: "", nextOfKinRelationship: "", nextOfKinPhone: "",
  emergencyContactName: "", emergencyContactRelationship: "", emergencyContactPhone: "",
  guarantorName: "", guarantorRelationship: "", guarantorPhone: "", guarantorAddress: "",
  primaryInsuranceCarrier: "", primaryInsurancePlan: "", primaryMemberId: "", primaryGroupNumber: "", primaryAuthorizationNumber: "",
  secondaryInsuranceCarrier: "", secondaryInsurancePlan: "", secondaryMemberId: "", secondaryGroupNumber: "",
  attendingPhysician: "", emergencyPhysician: "", primaryCarePhysician: "", referringFacility: "", hospitalService: "",
  admitDiagnosis: "", visitReason: "", principalDiagnosis: "", otherDiagnoses: "", principalProcedure: "", otherProcedures: "", icdCodes: [],
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
  return /\b(ssn|social security|social security number|mother'?s maiden name)\b/.test(label)
    || /\b\d{3}-\d{2}-\d{4}\b/.test(item.value);
}

export function buildReferralAdditionalInformation(input: {
  documentCategory?: DocumentCategory | string | null;
  sex?: string | null;
  medicalRecordNumber?: string | null;
  referral?: Partial<ReferralData> | null;
  facesheet?: Partial<FacesheetData> | null;
  additionalInformation?: AdditionalInformationItem[] | null;
}) {
  const referral = { ...EMPTY_REFERRAL_DATA, ...(input.referral ?? {}) };
  const facesheet = { ...EMPTY_FACESHEET_DATA, ...(input.facesheet ?? {}) };
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
    row("Hospital encounter", "Facility", facesheet.facilityName),
    row("Hospital encounter", "Facility location", facesheet.facilityLocation),
    row("Hospital encounter", "Encounter type", facesheet.encounterType),
    row("Hospital encounter", "Financial / account number", facesheet.financialAccountNumber),
    row("Hospital encounter", "Arrival date", facesheet.arrivalDate),
    row("Hospital encounter", "Arrival time", facesheet.arrivalTime),
    row("Hospital encounter", "Admit date", facesheet.admitDate),
    row("Hospital encounter", "Admit time", facesheet.admitTime),
    row("Hospital encounter", "Discharge date", facesheet.dischargeDate),
    row("Hospital encounter", "Discharge time", facesheet.dischargeTime),
    row("Hospital encounter", "Room / bed", facesheet.roomBed),
    row("Hospital encounter", "Length of stay", facesheet.lengthOfStay),
    row("Patient demographics", "Patient language", facesheet.patientLanguage),
    row("Patient demographics", "Race", facesheet.race),
    row("Patient demographics", "Religion", facesheet.religion),
    row("Patient demographics", "Ethnic group", facesheet.ethnicGroup),
    row("Patient demographics", "Country of birth", facesheet.countryOfBirth),
    row("Patient demographics", "Marital status", facesheet.maritalStatus),
    row("Patient demographics", "Occupation", facesheet.occupation),
    row("Patient contact", "Cell phone", facesheet.cellPhone),
    row("Patient contact", "Alternate phone", facesheet.alternatePhone),
    row("Next of kin", "Name", facesheet.nextOfKinName),
    row("Next of kin", "Relationship", facesheet.nextOfKinRelationship),
    row("Next of kin", "Phone", facesheet.nextOfKinPhone),
    row("Emergency contact", "Name", facesheet.emergencyContactName),
    row("Emergency contact", "Relationship", facesheet.emergencyContactRelationship),
    row("Emergency contact", "Phone", facesheet.emergencyContactPhone),
    row("Guarantor", "Name", facesheet.guarantorName),
    row("Guarantor", "Relationship", facesheet.guarantorRelationship),
    row("Guarantor", "Phone", facesheet.guarantorPhone),
    row("Guarantor", "Address", facesheet.guarantorAddress),
    row("Primary insurance", "Carrier", facesheet.primaryInsuranceCarrier),
    row("Primary insurance", "Plan", facesheet.primaryInsurancePlan),
    row("Primary insurance", "Member / policy ID", facesheet.primaryMemberId),
    row("Primary insurance", "Group number", facesheet.primaryGroupNumber),
    row("Primary insurance", "Authorization number", facesheet.primaryAuthorizationNumber),
    row("Secondary insurance", "Carrier", facesheet.secondaryInsuranceCarrier),
    row("Secondary insurance", "Plan", facesheet.secondaryInsurancePlan),
    row("Secondary insurance", "Member / policy ID", facesheet.secondaryMemberId),
    row("Secondary insurance", "Group number", facesheet.secondaryGroupNumber),
    row("Care team", "Attending physician", facesheet.attendingPhysician),
    row("Care team", "Emergency physician", facesheet.emergencyPhysician),
    row("Care team", "Primary care physician", facesheet.primaryCarePhysician),
    row("Care team", "Referring / transferring facility", facesheet.referringFacility),
    row("Care team", "Hospital service", facesheet.hospitalService),
    row("Clinical", "Admit diagnosis", facesheet.admitDiagnosis),
    row("Clinical", "Visit reason", facesheet.visitReason),
    row("Clinical", "Principal diagnosis", facesheet.principalDiagnosis),
    row("Clinical", "Other diagnoses", facesheet.otherDiagnoses),
    row("Clinical", "Principal procedure", facesheet.principalProcedure),
    row("Clinical", "Other procedures", facesheet.otherProcedures),
    row("Clinical", "ICD codes", facesheet.icdCodes.join(", ")),
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

export function isHospitalFacesheet(category?: string | null) {
  return category === "hospital_facesheet_standard" || category === "hospital_facesheet_extended";
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
  if (/(hospital[\s_-]*)?face[\s_-]*sheet/.test(text)) {
    if (/extended|multiple insurance|barcode/.test(text)) return "hospital_facesheet_extended" as const;
    return "hospital_facesheet_standard" as const;
  }
  return "regular" as const;
}
