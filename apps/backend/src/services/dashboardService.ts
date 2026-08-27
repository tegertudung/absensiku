import { prisma } from '../utils/prisma';

// "Sesi menipis" threshold — not specified numerically in the doc, 3 sessions
// left is a reasonable early-warning default. Revisit once real usage data exists.
const LOW_QUOTA_THRESHOLD = 3;

function getTodayRangeUTC() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/**
 * Module 2 (Dashboard Admin): "Ringkasan sesi hari ini, sesi menunggu
 * tindakan, siswa privat dengan sesi menipis, dan rekap operasional."
 */
export async function getAdminDashboardSummary() {
  const { start, end } = getTodayRangeUTC();

  const [
    todaySessionsCount,
    pendingValidationsCount,
    lowQuotaPackages,
    activeTutorsCount,
    activeStudentsCount,
  ] = await Promise.all([
    prisma.teachingSession.count({ where: { sessionDate: { gte: start, lt: end } } }),
    prisma.sessionValidation.count({ where: { decision: 'PENDING' } }),
    prisma.privatePackage.findMany({
      where: { status: 'ACTIVE', quotaRemaining: { lte: LOW_QUOTA_THRESHOLD } },
      include: { student: { select: { name: true } } },
      orderBy: { quotaRemaining: 'asc' },
    }),
    prisma.tutor.count({ where: { status: 'ACTIVE' } }),
    prisma.student.count({ where: { status: 'ACTIVE' } }),
  ]);

  return {
    todaySessionsCount,
    pendingValidationsCount,
    lowQuotaPackages,
    activeTutorsCount,
    activeStudentsCount,
  };
}

/**
 * Beranda Tentor (section J): "jadwal hari ini, sesi berikutnya, sesi yang
 * belum diselesaikan, ringkasan mengajar."
 */
export async function getTutorDashboardSummary(tutorId: string) {
  const { start, end } = getTodayRangeUTC();

  const [todaySessions, unfinishedSessions, totalCompletedSessions] = await Promise.all([
    prisma.teachingSession.findMany({
      where: { tutorId, sessionDate: { gte: start, lt: end } },
      include: {
        class: { select: { name: true } },
        student: { select: { name: true } },
        subject: { select: { name: true } },
      },
      orderBy: { sessionDate: 'asc' },
    }),
    prisma.teachingSession.findMany({
      where: { tutorId, status: { in: ['SCHEDULED', 'IN_PROGRESS', 'PENDING_ADMIN'] } },
      include: {
        class: { select: { name: true } },
        student: { select: { name: true } },
      },
      orderBy: { sessionDate: 'asc' },
    }),
    prisma.teachingSession.count({ where: { tutorId, status: 'COMPLETED' } }),
  ]);

  return { todaySessions, unfinishedSessions, totalCompletedSessions };
}
