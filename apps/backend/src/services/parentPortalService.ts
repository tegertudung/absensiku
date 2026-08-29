import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';

/** Throws 403 if the given student isn't one of this parent's linked children. */
async function assertOwnsChild(parentId: string, studentId: string) {
  const link = await prisma.parentStudent.findUnique({
    where: { parentId_studentId: { parentId, studentId } },
  });
  if (!link) throw new AppError('Anda tidak memiliki akses ke data siswa ini', 403);
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
    orderBy: { student: { name: 'asc' } },
  });

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
export async function getChildProgress(parentId: string, studentId: string) {
  await assertOwnsChild(parentId, studentId);

  const [privateSessions, attendanceRecords] = await Promise.all([
    prisma.teachingSession.findMany({
      where: { studentId, sessionType: 'PRIVATE', status: 'COMPLETED' },
      include: { tutor: { select: { name: true } }, subject: { select: { name: true } } },
      orderBy: { sessionDate: 'desc' },
      take: 50,
    }),
    prisma.attendanceRecord.findMany({
      where: { studentId },
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
      material: s.material,
      progressNotes: s.progressNotes,
      score: s.score,
    })),
    regularAttendance: attendanceRecords
      .filter((a) => a.session.status === 'COMPLETED')
      .map((a) => ({
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
