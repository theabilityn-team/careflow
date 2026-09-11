import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { createCsv, createExcel, createLeadExport, createPdf, exportRowValues, type ExportLeadRow } from "./leadExport";

const row: ExportLeadRow = {
  id: 42,
  firstName: "Ana",
  lastName: "Stone",
  email: "ana@example.com",
  phone: "+1 555 0100",
  address: "10 Main Street",
  city: "Miami",
  stateCode: "FL",
  stateProvince: "Florida",
  postalCode: "33101",
  country: "United States",
  status: "follow_up",
  interestLevel: "warm",
  assignedStaff: "Technical Agent",
  nextFollowUpAt: Date.UTC(2026, 8, 12, 15, 30),
  createdAt: new Date("2026-09-09T10:00:00.000Z"),
  updatedAt: new Date("2026-09-10T11:00:00.000Z"),
};

describe("lead exports", () => {
  it("creates a UTF-8 CSV with status and basic fields only", () => {
    const csv = createCsv([row]).toString("utf8");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Status"');
    expect(csv).toContain('"Follow-up required"');
    expect(csv).toContain('"Ana"');
    expect(csv).not.toContain("Diagnosis");
    expect(csv).not.toContain("Clinical Notes");
  });

  it("neutralizes spreadsheet formulas in CSV cells", () => {
    const csv = createCsv([{ ...row, email: "=HYPERLINK(\"https://example.com\")" }]).toString("utf8");
    expect(csv).toContain("'=HYPERLINK");
  });

  it("includes Oregon in the shared row values used by CSV, Excel, and PDF exports", () => {
    const oregon = { ...row, city: "Portland", stateCode: "OR", stateProvince: "Oregon", postalCode: "97201" };
    expect(exportRowValues(oregon)[7]).toBe("OR");
    expect(createCsv([oregon]).toString("utf8")).toContain('"OR","Oregon","97201"');
  });

  it("creates a formatted Excel workbook with a status column and summary", async () => {
    const buffer = await createExcel([row], ["follow_up"]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const leads = workbook.getWorksheet("Leads");
    expect(leads?.getCell("L1").value).toBe("Status");
    expect(leads?.getCell("L2").value).toBe("Follow-up required");
    expect(workbook.getWorksheet("Export Summary")?.getCell("B3").value).toBe(1);
  });

  it("creates valid PDF and format metadata", async () => {
    const pdf = await createPdf([row], ["follow_up"]);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
    const output = await createLeadExport("pdf", [row], ["follow_up"]);
    expect(output.mimeType).toBe("application/pdf");
    expect(output.extension).toBe("pdf");
  });
});
