import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

export const LEAD_STATUS_LABELS = {
  new: "New",
  pending_review: "Pending review",
  verified: "Verified",
  to_contact: "To be contacted",
  voicemail_left: "Voicemail left",
  contacted: "Contacted",
  follow_up: "Follow-up required",
  interested: "Interested",
  highly_interested: "Highly interested",
  qualified: "Qualified",
  customer: "Customer",
  buyer: "Buyer",
  not_interested: "Not interested",
  unable_to_reach: "Unable to reach",
  archived: "Archived",
} as const;

export const INTEREST_LABELS = {
  unknown: "Unknown",
  cold: "Cold",
  warm: "Warm",
  hot: "Hot",
} as const;

export type ExportFormat = "csv" | "xlsx" | "pdf";
export type ExportLeadRow = {
  id: number;
  firstName: string;
  lastName: string;
  preferredLanguage: "en" | "es";
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  stateCode: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
  status: keyof typeof LEAD_STATUS_LABELS;
  interestLevel: keyof typeof INTEREST_LABELS;
  assignedStaff: string | null;
  nextFollowUpAt: number | null;
  createdAt: Date;
  updatedAt: Date;
};

const HEADERS = [
  "Lead ID", "First Name", "Last Name", "Lead Language", "Email", "Phone", "Address", "City",
  "Operational State", "State / Province", "Postal Code", "Country", "Status", "Interest Level",
  "Assigned Staff", "Next Follow-up (UTC)", "Created At (UTC)", "Last Updated (UTC)",
] as const;

const iso = (value: Date | number | null) => value ? new Date(value).toISOString() : "";

export function exportRowValues(row: ExportLeadRow) {
  return [
    row.id, row.firstName, row.lastName, row.preferredLanguage === "es" ? "Spanish" : "English", row.email ?? "", row.phone ?? "", row.address ?? "",
    row.city ?? "", row.stateCode ?? "", row.stateProvince ?? "", row.postalCode ?? "", row.country ?? "",
    LEAD_STATUS_LABELS[row.status], INTEREST_LABELS[row.interestLevel], row.assignedStaff ?? "Unassigned",
    iso(row.nextFollowUpAt), iso(row.createdAt), iso(row.updatedAt),
  ];
}

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function createCsv(rows: ExportLeadRow[]) {
  const lines = [HEADERS.map(csvCell).join(","), ...rows.map(row => exportRowValues(row).map(csvCell).join(","))];
  return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}

export async function createExcel(rows: ExportLeadRow[], selectedStatuses: string[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CareFlow CRM";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Leads", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow([...HEADERS]);
  rows.forEach(row => sheet.addRow(exportRowValues(row)));
  sheet.autoFilter = { from: "A1", to: "R1" };
  sheet.columns = [
    { width: 10 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 30 }, { width: 18 }, { width: 34 },
    { width: 18 }, { width: 18 }, { width: 20 }, { width: 14 }, { width: 18 }, { width: 22 }, { width: 16 },
    { width: 24 }, { width: 24 }, { width: 24 }, { width: 24 },
  ];
  const header = sheet.getRow(1);
  header.height = 24;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  header.alignment = { vertical: "middle" };
  sheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: "top", wrapText: true };
    if (rowNumber > 1 && rowNumber % 2 === 1) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F7F6" } };
    }
  });
  const summary = workbook.addWorksheet("Export Summary");
  summary.columns = [{ width: 24 }, { width: 70 }];
  summary.addRows([
    ["CareFlow CRM", "Lead export"],
    ["Generated at (UTC)", new Date().toISOString()],
    ["Lead count", rows.length],
    ["Status filters", selectedStatuses.map(status => LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS]).join(", ")],
    ["Privacy", "Basic lead information only. Clinical data and source documents are excluded."],
  ]);
  summary.getColumn(1).font = { bold: true, color: { argb: "FF0F766E" } };
  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}

function collectPdf(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", chunk => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

const pdfText = (value: unknown, max = 35) => {
  const text = value === null || value === undefined || value === "" ? "—" : String(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

export async function createPdf(rows: ExportLeadRow[], selectedStatuses: string[]) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 28, bufferPages: true, info: { Title: "CareFlow CRM Lead Export", Author: "CareFlow CRM" } });
  const result = collectPdf(doc);
  const widths = [28, 88, 102, 62, 66, 70, 48, 77, 72, 70, 55];
  const headers = ["ID", "Lead", "Email", "Phone", "Language", "Status", "Interest", "Assigned", "City / State", "Follow-up", "Created"];
  const startX = 28;
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);
  const drawHeader = () => {
    const y = doc.y;
    doc.rect(startX, y, tableWidth, 22).fill("#0f766e");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8);
    let x = startX;
    headers.forEach((header, index) => { doc.text(header, x + 4, y + 7, { width: widths[index] - 8, lineBreak: false }); x += widths[index]; });
    doc.y = y + 22;
  };
  const ensureRoom = () => {
    if (doc.y <= doc.page.height - 55) return;
    doc.addPage();
    drawHeader();
  };

  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(18).text("CareFlow CRM — Lead Export");
  doc.moveDown(0.25).fillColor("#475569").font("Helvetica").fontSize(8.5)
    .text(`Generated: ${new Date().toISOString()}  |  Leads: ${rows.length}`)
    .text(`Statuses: ${selectedStatuses.map(status => LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS]).join(", ")}`)
    .text("Basic lead information only. Clinical data and source documents are excluded.");
  doc.moveDown(0.7);
  drawHeader();

  rows.forEach((row, rowIndex) => {
    ensureRoom();
    const y = doc.y;
    if (rowIndex % 2 === 1) doc.rect(startX, y, tableWidth, 24).fill("#f3f7f6");
    const values = [
      row.id, `${row.firstName} ${row.lastName}`, row.email, row.phone, row.preferredLanguage === "es" ? "Spanish" : "English",
      LEAD_STATUS_LABELS[row.status], INTEREST_LABELS[row.interestLevel],
      row.assignedStaff ?? "Unassigned", [row.city, row.stateCode || row.stateProvince].filter(Boolean).join(", "),
      row.nextFollowUpAt ? new Date(row.nextFollowUpAt).toISOString().slice(0, 10) : "—",
      row.createdAt.toISOString().slice(0, 10),
    ];
    doc.fillColor("#0f172a").font("Helvetica").fontSize(7.5);
    let x = startX;
    values.forEach((value, index) => { doc.text(pdfText(value, index === 2 ? 34 : 26), x + 4, y + 8, { width: widths[index] - 8, lineBreak: false }); x += widths[index]; });
    doc.y = y + 24;
  });

  const range = doc.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    doc.fillColor("#64748b").font("Helvetica").fontSize(7).text(`Page ${pageIndex + 1} of ${range.count}`, 28, doc.page.height - doc.page.margins.bottom - 9, { align: "right", width: doc.page.width - 56, lineBreak: false });
  }
  doc.end();
  return result;
}

export async function createLeadExport(format: ExportFormat, rows: ExportLeadRow[], selectedStatuses: string[]) {
  if (format === "csv") return { buffer: createCsv(rows), mimeType: "text/csv;charset=utf-8", extension: "csv" };
  if (format === "xlsx") return { buffer: await createExcel(rows, selectedStatuses), mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" };
  return { buffer: await createPdf(rows, selectedStatuses), mimeType: "application/pdf", extension: "pdf" };
}
