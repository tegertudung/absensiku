import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';

/**
 * Resolves a child only through the ParentStudent mapping.  This is the
 * server-side boundary for every parent endpoint that accepts a student id.
 * A missing link deliberately has the same response as a missing student so
 * a parent cannot use this endpoint to discover other students.
 */
export async function assertParentOwnsStudent(parentId: string, studentId: string) {
  const link = await prisma.parentStudent.findUnique({
    where: { parentId_studentId: { parentId, studentId } },
  });
  if (!link) throw new AppError('Data siswa tidak ditemukan.', 404);
  return link;
}

/**
 * Beranda Orang Tua: every linked child, each with active regular
 * enrollments and active private packages (both carry quota) so the parent
 * can see "sisa sesi berapa" at a glance without opening each child.
 */
export async function listChildrenForParent(parentId: string) {
  const links = await prisma.parentStudent.findMany({
    where: { parentId },
    include: {
      student: {
        include: {
          enrollments: {
            where: { status: 'ACTIVE' },
            include: { class: { select: { id: true, name: true, quotaTotal: true, quotaUsed: true, quotaRemaining: true } } },
          },
          packages: {
            where: { status: 'ACTIVE' },
            select: { id: true, packageName: true, quotaTotal: true, quotaUsed: true, quotaRemaining: true },
          },
        },
      },
    },
  });

  // Sorted in JS, not via `orderBy` on the `student` relation — see the note
  // on the same pattern in dashboardService.ts (production Postgres error
  // on relation-orderBy that never reproduced locally, avoided outright).
  links.sort((a, b) => a.student.name.localeCompare(b.student.name));

  return links.map((link) => ({
    relationship: link.relationship,
    student: {
      id: link.student.id,
      name: link.student.name,
      status: link.student.status,
      programs: [
        ...link.student.enrollments.map((e) => ({
          type: 'REGULAR' as const,
          label: e.class.name,
          quotaTotal: e.class.quotaTotal,
          quotaUsed: e.class.quotaUsed,
          quotaRemaining: e.class.quotaRemaining,
        })),
        ...link.student.packages.map((p) => ({
          type: 'PRIVATE' as const,
          label: p.packageName || 'Paket Privat',
          quotaTotal: p.quotaTotal,
          quotaUsed: p.quotaUsed,
          quotaRemaining: p.quotaRemaining,
        })),
      ],
    },
  }));
}

/**
 * Progres belajar satu anak: gabungan riwayat sesi privat (materi/catatan/
 * nilai langsung dari TeachingSession, karena privat memang tercatat
 * per-siswa) dan kehadiran kelas reguler (dari AttendanceRecord, karena
 * TeachingSession reguler tercatat per-kelas bukan per-siswa — lihat catatan
 * yang sama di halaman detail siswa admin).
 */
export async function getChildProgress(parentId: string, studentId: string, date?: Date) {
  await assertParentOwnsStudent(parentId, studentId);

  const dayRange = date
    ? {
        gte: date,
        lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
      }
    : undefined;

  const [privateSessions, attendanceRecords] = await Promise.all([
    prisma.teachingSession.findMany({
      where: { studentId, sessionType: 'PRIVATE', status: 'COMPLETED', ...(dayRange ? { sessionDate: dayRange } : {}) },
      include: { tutor: { select: { name: true } }, subject: { select: { name: true } } },
      orderBy: { sessionDate: 'desc' },
      take: 50,
    }),
    prisma.attendanceRecord.findMany({
      // Filtered to COMPLETED sessions here (not after fetching) — doing it
      // in JS after `take: 50` could silently drop real completed records
      // behind a recent run of SCHEDULED/IN_PROGRESS/PENDING_ADMIN ones.
      where: {
        studentId,
        session: {
          status: 'COMPLETED',
          ...(dayRange ? { sessionDate: dayRange } : {}),
        },
      },
      include: {
        session: {
          include: {
            tutor: { select: { name: true } },
            class: { select: { name: true } },
            subject: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  return {
    privateSessions: privateSessions.map((s) => ({
      id: s.id,
      sessionDate: s.sessionDate,
      tutorName: s.tutor.name,
      subjectName: s.subject?.name ?? null,
      startTime: s.startTime,
      endTime: s.endTime,
      mode: s.mode,
      location: s.location,
      material: s.material,
      progressNotes: s.progressNotes,
      score: s.score,
    })),
    regularAttendance: attendanceRecords.map((a) => ({
      id: a.id,
      sessionDate: a.session.sessionDate,
      className: a.session.class?.name ?? null,
      subjectName: a.session.subject?.name ?? null,
      tutorName: a.session.tutor.name,
      material: a.session.material,
      attendanceStatus: a.status,
    })),
  };
}
