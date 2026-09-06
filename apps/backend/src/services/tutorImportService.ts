import { prisma } from "../utils/prisma";
import { readWorkbookRows, ColumnSpec } from "./importService";
import { createTutor } from "./tutorService";

const COLUMNS: ColumnSpec[] = [
  { key: "name", aliases: ["Nama", "Nama Tentor"], required: true },
  { key: "title", aliases: ["Gelar"], required: false },
  { key: "phone", aliases: ["No.Telepon", "No Telepon", "Nomor Telepon", "Telepon"], required: true },
  { key: "email", aliases: ["Email"], required: true },
  {
    key: "subjects",
    aliases: ["Mata Pelajaran yang diajar", "Mata Pelajaran", "Mata Pelajaran Diajar"],
    required: true,
  },
];

export interface TutorImportRow {
  rowNumber: number;
  name: string;
  title: string;
  phone: string;
  email: string;
  subjectNames: string[];
  subjectIds: string[];
  errors: string[];
}

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("620")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("62")) digits = `0${digits.slice(2)}`;
  return digits;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function validateRows(
  parsed: Array<{ rowNumber: number; values: Record<string, string> }>,
): Promise<TutorImportRow[]> {
  const [existingUsers, subjects] = await Promise.all([
    prisma.user.findMany({ select: { email: true } }),
    prisma.subject.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  const takenEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));
  const subjectsByName = new Map(subjects.map((s) => [s.name.trim().toLowerCase(), s.id]));

  const rows: TutorImportRow[] = [];
  for (const { rowNumber, values } of parsed) {
    const errors: string[] = [];
    const name = values.name.trim();
    const title = values.title.trim();
    const phone = normalizePhone(values.phone);
    const email = values.email.trim().toLowerCase();
    const subjectNames = values.subjects
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!name || name.length < 2) errors.push("Nama minimal 2 karakter.");
    if (!phone) errors.push("Nomor telepon wajib diisi.");
    else if (!/^\d{10,13}$/.test(phone))
      errors.push("Nomor telepon harus 10–13 digit angka.");
    if (!email) errors.push("Email wajib diisi.");
    else if (!EMAIL_RE.test(email)) errors.push("Format email tidak valid.");
    else if (takenEmails.has(email)) errors.push(`Email "${email}" sudah terdaftar.`);

    const subjectIds: string[] = [];
    if (subjectNames.length === 0) {
      errors.push("Mata pelajaran wajib diisi.");
    } else {
      for (const subjectName of subjectNames) {
        const id = subjectsByName.get(subjectName.toLowerCase());
        if (!id) errors.push(`Mata pelajaran "${subjectName}" tidak ditemukan.`);
        else subjectIds.push(id);
      }
    }

    // A valid row's email now occupies the slot for any later row in the
    // same file — catches duplicate emails within the uploaded sheet itself,
    // not just against what was already in the database.
    if (errors.length === 0) takenEmails.add(email);

    rows.push({ rowNumber, name, title, phone, email, subjectNames, subjectIds, errors });
  }
  return rows;
}

export async function previewTutorImport(buffer: Buffer): Promise<TutorImportRow[]> {
  const parsed = await readWorkbookRows(buffer, COLUMNS);
  return validateRows(parsed);
}

export interface TutorImportCommitResult {
  created: number;
  failures: Array<{ rowNumber: number; email: string; message: string }>;
}

export interface TutorImportRowInput {
  rowNumber: number;
  name: string;
  title: string;
  phone: string;
  email: string;
  subjectNames: string[];
}

/**
 * Re-validates every row from scratch (same rules as preview) rather than
 * trusting whatever the client posts back — catches anything that changed
 * between preview and commit (an email taken in the meantime, a subject
 * deactivated), and lets an admin's inline edit in the preview table (e.g.
 * fixing a misread phone number) go through the exact same checks as the
 * original file did.
 */
export async function commitTutorImport(
  inputRows: TutorImportRowInput[],
): Promise<TutorImportCommitResult> {
  const rawRows = inputRows.map((row) => ({
    rowNumber: row.rowNumber,
    values: {
      name: row.name,
      title: row.title,
      phone: row.phone,
      email: row.email,
      subjects: row.subjectNames.join(","),
    },
  }));
  const rows = await validateRows(rawRows);
  const failures: TutorImportCommitResult["failures"] = [];
  let created = 0;
  for (const row of rows) {
    if (row.errors.length > 0) {
      failures.push({ rowNumber: row.rowNumber, email: row.email, message: row.errors.join(" ") });
      continue;
    }
    try {
      await createTutor({
        email: row.email,
        name: row.name,
        phone: row.phone,
        title: row.title || undefined,
        subjectIds: row.subjectIds,
      });
      created += 1;
    } catch (err) {
      failures.push({
        rowNumber: row.rowNumber,
        email: row.email,
        message: err instanceof Error ? err.message : "Gagal membuat akun tentor.",
      });
    }
  }
  return { created, failures };
}
