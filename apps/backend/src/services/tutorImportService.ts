import { prisma } from "../utils/prisma";
import { readWorkbookRows, ColumnSpec } from "./importService";
import { provisionTutorFromImport } from "./tutorService";
import { AppError } from "../utils/errors";

const COLUMNS: ColumnSpec[] = [
  { key: "name", aliases: ["Nama", "Nama Tentor"], required: true },
  { key: "title", aliases: ["Gelar"], required: false },
  {
    key: "phone",
    aliases: ["No.Telepon", "No Telepon", "Nomor Telepon", "Telepon"],
    required: true,
  },
  { key: "email", aliases: ["Email"], required: true },
  {
    key: "subjects",
    aliases: [
      "Mata Pelajaran yang diajar",
      "Mata Pelajaran",
      "Mata Pelajaran Diajar",
    ],
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
    prisma.user.findMany({
      select: {
        email: true,
        role: true,
        isActive: true,
        tutor: { select: { deletedAt: true } },
      },
    }),
    prisma.subject.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    }),
  ]);
  const existingByEmail = new Map(
    existingUsers.map((user) => [user.email.toLowerCase(), user]),
  );
  const seenEmails = new Set<string>();
  const subjectsByName = new Map(
    subjects.map((s) => [s.name.trim().toLowerCase(), s.id]),
  );

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
    else if (seenEmails.has(email))
      errors.push(`Email "${email}" muncul lebih dari sekali dalam file.`);
    else {
      const existing = existingByEmail.get(email);
      if (
        existing &&
        (existing.role !== "TENTOR" ||
          !existing.tutor ||
          Boolean(existing.tutor.deletedAt) === existing.isActive)
      ) {
        errors.push(
          `Email "${email}" digunakan akun lain atau memiliki status yang tidak konsisten.`,
        );
      }
    }

    const subjectIds: string[] = [];
    if (subjectNames.length === 0) {
      errors.push("Mata pelajaran wajib diisi.");
    } else {
      for (const subjectName of subjectNames) {
        const id = subjectsByName.get(subjectName.toLowerCase());
        if (!id)
          errors.push(`Mata pelajaran "${subjectName}" tidak ditemukan.`);
        else subjectIds.push(id);
      }
    }

    // A valid row's email now occupies the slot for any later row in the
    // same file — catches duplicate emails within the uploaded sheet itself,
    // not just against what was already in the database.
    if (email) seenEmails.add(email);

    rows.push({
      rowNumber,
      name,
      title,
      phone,
      email,
      subjectNames,
      subjectIds,
      errors,
    });
  }
  return rows;
}

export async function previewTutorImport(
  buffer: Buffer,
): Promise<TutorImportRow[]> {
  const parsed = await readWorkbookRows(buffer, COLUMNS);
  return validateRows(parsed);
}

export interface TutorImportCommitResult {
  created: number;
  restored: number;
  alreadyActive: number;
  failed: number;
  failures: Array<{ rowNumber: number; email: string; message: string }>;
  credentials: Array<{
    name: string;
    email: string;
    status: "CREATED" | "RESTORED";
    temporaryPassword: string;
  }>;
  results: Array<{
    rowNumber: number;
    name: string;
    email: string;
    status: "CREATED" | "RESTORED" | "ALREADY_ACTIVE" | "FAILED";
    message?: string;
  }>;
}

export interface TutorImportRowInput {
  rowNumber: number;
  name: string;
  title: string;
  phone: string;
  email: string;
  subjectNames: string[];
}

function safeImportFailure(error: unknown) {
  if (error instanceof AppError) return error.message;
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "P2002") return "Data akun tersebut sudah terdaftar.";
  return "Gagal memproses akun Tentor.";
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
  adminId: string,
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
  const credentials: TutorImportCommitResult["credentials"] = [];
  const results: TutorImportCommitResult["results"] = [];
  let created = 0;
  let restored = 0;
  let alreadyActive = 0;
  for (const row of rows) {
    if (row.errors.length > 0) {
      const message = row.errors.join(" ");
      failures.push({
        rowNumber: row.rowNumber,
        email: row.email,
        message,
      });
      results.push({
        rowNumber: row.rowNumber,
        name: row.name,
        email: row.email,
        status: "FAILED",
        message,
      });
      continue;
    }
    try {
      const result = await provisionTutorFromImport(
        {
          email: row.email,
          name: row.name,
          phone: row.phone,
          title: row.title || undefined,
          subjectIds: row.subjectIds,
        },
        adminId,
      );
      if (result.status === "ALREADY_ACTIVE") {
        alreadyActive += 1;
        results.push({
          rowNumber: row.rowNumber,
          name: row.name,
          email: row.email,
          status: result.status,
        });
      } else {
        if (result.status === "CREATED") created += 1;
        else restored += 1;
        credentials.push({
          name: row.name,
          email: row.email,
          status: result.status,
          temporaryPassword: result.temporaryPassword,
        });
        results.push({
          rowNumber: row.rowNumber,
          name: row.name,
          email: row.email,
          status: result.status,
        });
      }
    } catch (err) {
      const message = safeImportFailure(err);
      failures.push({
        rowNumber: row.rowNumber,
        email: row.email,
        message,
      });
      results.push({
        rowNumber: row.rowNumber,
        name: row.name,
        email: row.email,
        status: "FAILED",
        message,
      });
    }
  }
  return {
    created,
    restored,
    alreadyActive,
    failed: failures.length,
    failures,
    credentials,
    results,
  };
}
