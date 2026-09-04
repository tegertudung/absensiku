import { randomUUID } from "crypto";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/errors";

export type LetterScheduleInput = { date: string; startTime: string; endTime: string };
export type StudentLetterInput = {
  studentId: string; studentNis: string; studentSchool: string; studentSchoolClass: string; letterDate: string; programName: string;
  startDate: string; endDate: string; schedules: LetterScheduleInput[];
};

const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
function yearRange(year: number) { return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }; }
function numberPrefix(value: string) { const match = /^(\d{1,})\/PIONEERCLASS\/[IVX]+\/(\d{4})$/.exec(value); return match ? Number(match[1]) : 0; }
type LetterNumberClient = Pick<typeof prisma, "studentLetter">;
async function nextLetterNumberForDate(date: string, client: LetterNumberClient = prisma) {
  const parsed = asDate(date); const year = parsed.getUTCFullYear();
  const letters = await client.studentLetter.findMany({ where: { letterDate: yearRange(year) }, select: { letterNumber: true } });
  const next = Math.max(0, ...letters.map((letter) => numberPrefix(letter.letterNumber))) + 1;
  return `${String(next).padStart(3, "0")}/PIONEERCLASS/${ROMAN_MONTHS[parsed.getUTCMonth()]}/${year}`;
}
export function getNextStudentLetterNumber(date: string) { return nextLetterNumberForDate(date); }

function validateSchedules(schedules: LetterScheduleInput[]) {
  if (!schedules.length) throw new AppError("Minimal satu jadwal pertemuan wajib diisi.");
  schedules.forEach((schedule, index) => {
    if (!schedule.date || !schedule.startTime || !schedule.endTime) throw new AppError(`Jadwal pertemuan ke-${index + 1} belum lengkap.`);
    if (!/^\d{2}:\d{2}$/.test(schedule.startTime) || !/^\d{2}:\d{2}$/.test(schedule.endTime) || schedule.startTime >= schedule.endTime) {
      throw new AppError(`Jam selesai pertemuan ke-${index + 1} harus setelah jam mulai.`);
    }
  });
}

async function verificationCode() {
  // UUID is generated server-side and is unrelated to a student ID, NIS or letter number.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = randomUUID();
    if (!(await prisma.studentLetter.findUnique({ where: { verificationCode: code }, select: { id: true } }))) return code;
  }
  throw new AppError("Kode verifikasi surat tidak dapat dibuat. Silakan coba lagi.", 500);
}

export async function listStudentLetters(search = "") {
  return prisma.studentLetter.findMany({
    where: search.trim() ? { OR: [{ letterNumber: { contains: search.trim(), mode: "insensitive" } }, { studentName: { contains: search.trim(), mode: "insensitive" } }] } : undefined,
    include: { _count: { select: { schedules: true } } }, orderBy: { createdAt: "desc" },
  });
}

export async function getStudentLetter(id: string) {
  const letter = await prisma.studentLetter.findUnique({ where: { id }, include: { schedules: { orderBy: { meetingNumber: "asc" } } } });
  if (!letter) throw new AppError("Surat siswa tidak ditemukan.", 404);
  return letter;
}

export async function createStudentLetter(input: StudentLetterInput) {
  validateSchedules(input.schedules);
  const student = await prisma.student.findUnique({ where: { id: input.studentId }, select: { id: true, name: true } });
  if (!student) throw new AppError("Siswa tidak ditemukan.", 404);
  const code = await verificationCode();
  return prisma.$transaction(async (tx) => tx.studentLetter.create({
    data: {
      studentId: student.id, letterNumber: await nextLetterNumberForDate(input.letterDate, tx), letterDate: asDate(input.letterDate),
      studentName: student.name, studentNis: input.studentNis.trim(), studentSchool: input.studentSchool.trim(), studentSchoolClass: input.studentSchoolClass.trim(),
      programName: input.programName.trim(), startDate: asDate(input.startDate), endDate: asDate(input.endDate), verificationCode: code,
      schedules: { create: input.schedules.map((schedule, index) => ({ meetingNumber: index + 1, date: asDate(schedule.date), startTime: schedule.startTime, endTime: schedule.endTime })) },
    }, include: { schedules: { orderBy: { meetingNumber: "asc" } } },
  }));
}

export async function updateStudentLetter(id: string, input: Omit<StudentLetterInput, "studentId">) {
  validateSchedules(input.schedules);
  await getStudentLetter(id);
  return prisma.$transaction(async (tx) => {
    await tx.studentLetterSchedule.deleteMany({ where: { studentLetterId: id } });
    return tx.studentLetter.update({ where: { id }, data: {
      letterDate: asDate(input.letterDate), studentNis: input.studentNis.trim(), studentSchool: input.studentSchool.trim(), studentSchoolClass: input.studentSchoolClass.trim(), programName: input.programName.trim(), startDate: asDate(input.startDate), endDate: asDate(input.endDate),
      schedules: { create: input.schedules.map((schedule, index) => ({ meetingNumber: index + 1, date: asDate(schedule.date), startTime: schedule.startTime, endTime: schedule.endTime })) },
    }, include: { schedules: { orderBy: { meetingNumber: "asc" } } } });
  });
}

export async function deleteStudentLetter(id: string) {
  await getStudentLetter(id);
  return prisma.studentLetter.delete({ where: { id }, select: { id: true } });
}

export async function verifyStudentLetter(code: string) {
  return prisma.studentLetter.findUnique({ where: { verificationCode: code }, select: { letterNumber: true, letterDate: true, studentName: true, programName: true, startDate: true, endDate: true } });
}
