import { describe, expect, it } from "vitest";
import { EMPTY_FACESHEET_DATA, EMPTY_REFERRAL_DATA } from "../shared/referralDocuments";
import { normalizeScannerExtraction, SCANNER_SYSTEM_PROMPT, scannerExtractionSchema } from "./routers/scanner";

function base() {
  return {
    firstName: "Doris",
    lastName: "Grimaldo Rangel",
    email: "",
    phone: "",
    dateOfBirth: "07/08/1974",
    sex: "Female",
    medicalRecordNumber: "6214245",
    address: "UNKNOWN ADDRESS",
    city: "Miami",
    stateProvince: "Florida",
    stateCode: "FL",
    postalCode: "00000",
    country: "USA",
    diagnosis: "",
    diagnosisCategory: "unknown",
    clinicalNotes: "Handwritten annotation: Colon Cancer",
    documentCategory: "hospital_facesheet_standard",
    referral: EMPTY_REFERRAL_DATA,
    facesheet: { ...EMPTY_FACESHEET_DATA },
    documentTypes: ["Jackson Health System Facesheet"],
    additionalInformation: [],
    overallConfidence: 0.87,
    reviewWarnings: ["Diagnosis was handwritten."],
  };
}

describe("Hospital Facesheet scanner support", () => {
  it("includes both layout classifications in the strict scanner schema and prompt", () => {
    const values = (scannerExtractionSchema.properties.documentCategory as { enum: string[] }).enum;
    expect(values).toEqual(expect.arrayContaining(["hospital_facesheet_standard", "hospital_facesheet_extended"]));
    expect(SCANNER_SYSTEM_PROMPT).toContain("hospital_facesheet_standard");
    expect(SCANNER_SYSTEM_PROMPT).toContain("hospital_facesheet_extended");
    expect(SCANNER_SYSTEM_PROMPT).toContain("mother's maiden names");
  });

  it("promotes a structured facesheet diagnosis and patient alternate phone without confusing contacts", () => {
    const result = normalizeScannerExtraction({
      ...base(),
      facesheet: {
        ...EMPTY_FACESHEET_DATA,
        cellPhone: "(786) 262-4275",
        emergencyContactPhone: "(786) 287-4964",
        admitDiagnosis: "Dengue fever [classical dengue]",
        visitReason: "abnormal labs",
      },
    });
    expect(result.phone).toBe("(786) 262-4275");
    expect(result.phone).not.toBe(result.facesheet.emergencyContactPhone);
    expect(result.diagnosis).toBe("Dengue fever [classical dengue]");
    expect(result.facesheet.visitReason).toBe("abnormal labs");
  });

  it("removes SSNs and mother's maiden names from unstructured extraction rows", () => {
    const result = normalizeScannerExtraction({
      ...base(),
      additionalInformation: [
        { section: "Patient", label: "SSN", value: "123-45-6789", confidence: 0.9 },
        { section: "Patient", label: "Mother's maiden name", value: "Private", confidence: 0.9 },
        { section: "Hospital encounter", label: "Room", value: "421 /02", confidence: 0.9 },
      ],
    });
    expect(result.additionalInformation).toEqual([{ section: "Hospital encounter", label: "Room", value: "421 /02", confidence: 0.9 }]);
  });
});
