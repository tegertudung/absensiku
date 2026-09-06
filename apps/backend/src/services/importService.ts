import ExcelJS from "exceljs";
import { AppError } from "../utils/errors";

export interface ColumnSpec {
  /** Canonical field key this column maps to, e.g. "name", "phone". */
  key: string;
  /** Header text variants accepted for this column (matched case/space-insensitively). */
  aliases: string[];
  required: boolean;
}

export interface ParsedRow {
  /** 1-based spreadsheet row number, for error messages ("Baris 5: ..."). */
  rowNumber: number;
  values: Record<string, string>;
}

function normalizeHeader(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.:]/g, "");
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    // Rich text / hyperlink cells — exceljs returns { richText: [...] } or { text, hyperlink }.
    const anyValue = value as { text?: string; richText?: Array<{ text: string }>; result?: unknown };
    if (typeof anyValue.text === "string") return anyValue.text.trim();
    if (Array.isArray(anyValue.richText))
      return anyValue.richText.map((part) => part.text).join("").trim();
    if (anyValue.result !== undefined) return String(anyValue.result).trim();
    return "";
  }
  return String(value).trim();
}

/**
 * Reads the first worksheet of an uploaded .xlsx as rows keyed by the
 * caller's canonical column keys, matched against a flexible set of header
 * aliases (so "No.Telepon", "No Telepon", and "Nomor Telepon" all resolve
 * to the same `phone` key) rather than requiring an exact header string.
 * Blank rows (every mapped cell empty) are skipped entirely rather than
 * surfacing as an empty-row validation error.
 */
export async function readWorkbookRows(
  buffer: Buffer,
  columns: ColumnSpec[],
): Promise<ParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new AppError(
      "File tidak dapat dibaca. Pastikan file berformat .xlsx yang valid.",
      400,
    );
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError("File tidak memiliki sheet data.", 400);

  const headerRow = sheet.getRow(1);
  const columnIndexByKey = new Map<string, number>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const normalized = normalizeHeader(cellText(cell.value));
    const match = columns.find((column) =>
      column.aliases.some((alias) => normalizeHeader(alias) === normalized),
    );
    if (match && !columnIndexByKey.has(match.key)) {
      columnIndexByKey.set(match.key, colNumber);
    }
  });

  const missing = columns.filter(
    (column) => column.required && !columnIndexByKey.has(column.key),
  );
  if (missing.length > 0) {
    throw new AppError(
      `Kolom berikut tidak ditemukan di file: ${missing.map((c) => c.aliases[0]).join(", ")}.`,
      400,
    );
  }

  const rows: ParsedRow[] = [];
  const lastRow = sheet.lastRow?.number ?? 1;
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values: Record<string, string> = {};
    for (const column of columns) {
      const colIndex = columnIndexByKey.get(column.key);
      values[column.key] = colIndex ? cellText(row.getCell(colIndex).value) : "";
    }
    const isBlank = Object.values(values).every((value) => value === "");
    if (isBlank) continue;
    rows.push({ rowNumber, values });
  }
  return rows;
}
