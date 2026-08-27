import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';

// Same as sessionService's OPEN_STATUSES — a tentor can only edit attendance
// while the session isn't finalized yet. Once locked, only admin can correct it.
const EDITABLE_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'PENDING_ADMIN'];

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

/**
 * Module 7 (Absensi Reguler): per-student attendance for a REGULAR teaching
 * session. Note this is independent from session completion (BR/H.1: "Sistem
 * mencatat sesi tersebut sebagai 1 sesi mengajar reguler, tanpa bergantung
 * pada jumlah siswa yang hadir") — attendance doesn't affect honor or status.
 * Upsert so re-submitting the form updates rather than duplicates.
 */
export async function recordAttendance(
  sessionId: string,
  records: Array<{ studentId: string; status: AttendanceStatus; notes?: string }>,
  actingTutorId?: string | null
) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.teachingSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new AppError('Sesi tidak ditemukan', 404);
    if (session.sessionType !== 'REGULAR') {
      throw new AppError('Absensi per-siswa hanya berlaku untuk sesi reguler', 400);
    }

    if (actingTutorId) {
      if (session.tutorId !== actingTutorId) {
        throw new AppError('Anda tidak memiliki akses ke sesi ini', 403);
      }
      if (!EDITABLE_STATUSES.includes(session.status)) {
        throw new AppError(
          `Sesi berstatus "${session.status}" sudah terkunci. Hubungi admin untuk koreksi.`,
          409
        );
      }
    }

    const results = [];
    for (const r of records) {
      const record = await tx.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId, studentId: r.studentId } },
        update: { status: r.status, notes: r.notes },
        create: { sessionId, studentId: r.studentId, status: r.status, notes: r.notes },
      });
      results.push(record);
    }

    return results;
  });
}

/**
 * Returns the class roster merged with whatever attendance has been recorded
 * so far for this session (null status = belum diisi).
 */
export async function getAttendanceForSession(sessionId: string) {
  const session = await prisma.teachingSession.findUnique({
    where: { id: sessionId },
    select: { id: true, sessionType: true, classId: true },
  });
  if (!session) throw new AppError('Sesi tidak ditemukan', 404);
  if (session.sessionType !== 'REGULAR' || !session.classId) {
    throw new AppError('Sesi ini bukan sesi reguler dengan kelas', 400);
  }

  const [enrollments, records] = await Promise.all([
    prisma.classEnrollment.findMany({
      where: { classId: session.classId, status: 'ACTIVE' },
      include: { student: { select: { id: true, name: true } } },
    }),
    prisma.attendanceRecord.findMany({ where: { sessionId } }),
  ]);

  const recordMap = new Map(records.map((r) => [r.studentId, r]));

  return enrollments.map((e) => ({
    studentId: e.student.id,
    studentName: e.student.name,
    status: recordMap.get(e.student.id)?.status ?? null,
    notes: recordMap.get(e.student.id)?.notes ?? null,
  }));
}
