import { describe, expect, it } from "vitest";
import { buildReferralAdditionalInformation, EMPTY_FACESHEET_DATA, EMPTY_REFERRAL_DATA, inferDiagnosisCategory, inferStoredDocumentType, isHospitalFacesheet, isProhibitedSensitiveItem } from "../shared/referralDocuments";

describe("referral document classification", () => {
  it("classifies anemia and blood disorders as hematology", () => {
    expect(inferDiagnosisCategory({ diagnosis: "Iron deficiency anemia, unspecified" })).toBe("hematology");
    expect(inferDiagnosisCategory({ diagnosis: "Neutropenia D70.9" })).toBe("hematology");
  });

  it("prioritizes explicit malignancy as oncology", () => {
    expect(inferDiagnosisCategory({ diagnosis: "Neutropenia; primary malignant neoplasm of jejunum" })).toBe("oncology");
  });

  it("uses receiving specialty when a referral contains no diagnosis", () => {
    expect(inferDiagnosisCategory({ receivingProviderSpecialty: "Hematology" })).toBe("hematology");
  });
});

describe("referral structured information", () => {
  it("groups referral, insurance, authorization, provider, and code data", () => {
    const rows = buildReferralAdditionalInformation({
      documentCategory: "referral_order",
      referral: {
        ...EMPTY_REFERRAL_DATA,
        referralReason: "Evaluate and treat",
        insuranceCarrier: "Example Health",
        authorizationNumber: "AUTH-123",
        referringProviderName: "Referring Clinician",
        receivingProviderName: "Receiving Clinician",
        icdCodes: ["D50.9"],
      },
    });
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "Referral", label: "Reason for referral" }),
      expect.objectContaining({ section: "Insurance", label: "Insurance carrier" }),
      expect.objectContaining({ section: "Authorization", label: "Authorization number" }),
      expect.objectContaining({ section: "Referring provider", label: "Provider" }),
      expect.objectContaining({ section: "Receiving provider", label: "Provider" }),
      expect.objectContaining({ section: "Codes", label: "ICD codes", value: "D50.9" }),
    ]));
  });

  it("excludes SSN labels and SSN-shaped values", () => {
    expect(isProhibitedSensitiveItem({ label: "Patient SSN", value: "hidden" })).toBe(true);
    expect(isProhibitedSensitiveItem({ label: "Identifier", value: "123-45-6789" })).toBe(true);
    const rows = buildReferralAdditionalInformation({
      additionalInformation: [
        { label: "SSN", value: "123-45-6789" },
        { label: "Preferred language", value: "English" },
      ],
    });
    expect(rows.some(item => item.label === "SSN")).toBe(false);
    expect(rows.some(item => item.label === "Preferred language")).toBe(true);
    expect(isProhibitedSensitiveItem({ label: "Mother's maiden name", value: "Private" })).toBe(true);
  });

  it("keeps explicit referrals separate and classifies all other records as regular", () => {
    expect(inferStoredDocumentType(JSON.stringify([{ label: "Document type", value: "Referral Order" }]))).toBe("referral_order");
    expect(inferStoredDocumentType(null, ["american-care-referral-form-page-1.jpg"])).toBe("referral_form");
    expect(inferStoredDocumentType(null, ["patient-medical-record.png"])).toBe("regular");
    expect(inferStoredDocumentType(null, ["scan-001.jpg"])).toBe("regular");
  });

  it("classifies both Hospital Facesheet layouts separately", () => {
    expect(inferStoredDocumentType(JSON.stringify([{ label: "Document type", value: "Hospital Facesheet Standard" }]))).toBe("hospital_facesheet_standard");
    expect(inferStoredDocumentType(JSON.stringify([{ label: "Document type", value: "Hospital Facesheet Extended" }]))).toBe("hospital_facesheet_extended");
    expect(inferStoredDocumentType(null, ["jackson-facesheet-barcode-page.jpg"])).toBe("hospital_facesheet_extended");
    expect(isHospitalFacesheet("hospital_facesheet_standard")).toBe(true);
    expect(isHospitalFacesheet("hospital_facesheet_extended")).toBe(true);
    expect(isHospitalFacesheet("regular")).toBe(false);
  });

  it("groups structured facesheet encounter, contact, insurance, care-team, and clinical fields", () => {
    const rows = buildReferralAdditionalInformation({
      documentCategory: "hospital_facesheet_extended",
      medicalRecordNumber: "5197472",
      facesheet: {
        ...EMPTY_FACESHEET_DATA,
        facilityName: "Jackson Health System",
        financialAccountNumber: "40026756831",
        emergencyContactName: "Jeni Gonzalez",
        primaryInsuranceCarrier: "Aetna Medicare",
        secondaryInsuranceCarrier: "Medicare",
        attendingPhysician: "Joseph Shanifa",
        admitDiagnosis: "Dengue fever",
      },
    });
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "Hospital encounter", label: "Facility", value: "Jackson Health System" }),
      expect.objectContaining({ section: "Emergency contact", label: "Name", value: "Jeni Gonzalez" }),
      expect.objectContaining({ section: "Primary insurance", label: "Carrier", value: "Aetna Medicare" }),
      expect.objectContaining({ section: "Secondary insurance", label: "Carrier", value: "Medicare" }),
      expect.objectContaining({ section: "Care team", label: "Attending physician", value: "Joseph Shanifa" }),
      expect.objectContaining({ section: "Clinical", label: "Admit diagnosis", value: "Dengue fever" }),
    ]));
  });
});
