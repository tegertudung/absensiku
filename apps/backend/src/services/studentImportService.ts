import { prisma } from "../utils/prisma";
import { readWorkbookRows, ColumnSpec } from "./importService";
import { createStudent } from "./studentService";

const COLUMNS: ColumnSpec[] = [
  { key: "name", aliases: ["Nama Siswa", "Nama"], required: true },
  { key: "phone", aliases: ["Nomor Telepon", "No.Telepon", "No Telepon", "Telepon"], required: true },
  {
    key: "guardianName",
    aliases: ["Nama Orang Tua/Wali", "Nama Orang Tua", "Orang Tua/Wali", "Nama Wali"],
    required: true,
  },
  {
    key: "guardianPhone",
    aliases: ["Telepon Orang Tua", "No.Telepon Orang Tua", "Nomor Telepon Orang Tua"],
    required: true,
  },
];

export interface StudentImportRow {
  rowNumber: number;
  name: string;
  phone: string;
  guardianName: string;
  guardianPhone: string;
  errors: string[];
}

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("620")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("62")) digits = `0${digits.slice(2)}`;
  return digits;
}

async function validateRows(
  parsed: Array<{ rowNumber: number; values: Record<string, string> }>,
): Promise<StudentImportRow[]> {
  const existing = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    select: { name: true, phone: true },
  });
  // Mirrors assertStudentIdentityAvailable's own-name+phone check so an
  // obvious duplicate shows up in the preview instead of only surfacing
  // once commit hits the database.
  const takenIdentities = new Set(
    existing
      .filter((s) => s.phone)
      .map((s) => `${s.name.trim().toLowerCase()}:${s.phone}`),
  );

  const rows: StudentImportRow[] = [];
  for (const { rowNumber, values } of parsed) {
    const errors: string[] = [];
    const name = values.name.trim();
    const phone = normalizePhone(values.phone);
    const guardianName = values.guardianName.trim();
    const guardianPhone = normalizePhone(values.guardianPhone);

    if (!name || name.length < 2) errors.push("Nama siswa minimal 2 karakter.");
    if (!phone) errors.push("Nomor telepon siswa wajib diisi.");
    else if (!/^\d{10,13}$/.test(phone))
      errors.push("Nomor telepon siswa harus 10–13 digit angka.");
    if (!guardianName) errors.push("Nama orang tua/wali wajib diisi.");
    if (!guardianPhone) errors.push("Telepon orang tua wajib diisi.");
    else if (!/^\d{10,13}$/.test(guardianPhone))
      errors.push("Telepon orang tua harus 10–13 digit angka.");

    if (errors.length === 0) {
      const identityKey = `${name.toLowerCase()}:${phone}`;
      if (takenIdentities.has(identityKey))
        errors.push(`Siswa "${name}" dengan nomor ini sudah terdaftar.`);
      else takenIdentities.add(identityKey);
    }

    rows.push({ rowNumber, name, phone, guardianName, guardianPhone, errors });
  }
  return rows;
}

export async function previewStudentImport(buffer: Buffer): Promise<StudentImportRow[]> {
  const parsed = await readWorkbookRows(buffer, COLUMNS);
  return validateRows(parsed);
}

export interface StudentImportCommitResult {
  created: number;
  failures: Array<{ rowNumber: number; name: string; message: string }>;
}

export interface StudentImportRowInput {
  rowNumber: number;
  name: string;
  phone: string;
  guardianName: string;
  guardianPhone: string;
}

export async function commitStudentImport(
  inputRows: StudentImportRowInput[],
): Promise<StudentImportCommitResult> {
  const rawRows = inputRows.map((row) => ({
    rowNumber: row.rowNumber,
    values: {
      name: row.name,
      phone: row.phone,
      guardianName: row.guardianName,
      guardianPhone: row.guardianPhone,
    },
  }));
  const rows = await validateRows(rawRows);
  const failures: StudentImportCommitResult["failures"] = [];
  let created = 0;
  for (const row of rows) {
    if (row.errors.length > 0) {
      failures.push({ rowNumber: row.rowNumber, name: row.name, message: row.errors.join(" ") });
      continue;
    }
    try {
      await createStudent({
        name: row.name,
        phone: row.phone,
        guardianName: row.guardianName,
        guardianPhone: row.guardianPhone,
      });
      created += 1;
    } catch (err) {
      failures.push({
        rowNumber: row.rowNumber,
        name: row.name,
        message: err instanceof Error ? err.message : "Gagal membuat data siswa.",
      });
    }
  }
  return { created, failures };
}
