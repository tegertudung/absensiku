import { prisma } from "../utils/prisma";
import { getSettings } from "./settingsService";
import { AppError } from "../utils/errors";

// "Sesi menipis" threshold — not specified numerically in the doc, 3 sessions
// left is a reasonable early-warning default. Revisit once real usage data exists.
const LOW_QUOTA_THRESHOLD = 3;

function getTodayRangeUTC() {
  const start = new Date();
  // TeachingSession.sessionDate is a date-only business value created in the
  // server's local timezone. Use matching local day bounds for dashboards;
  // UTC bounds can exclude the early/local portion of the current day.
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * Module 2 (Dashboard Admin): "Ringkasan sesi hari ini, sesi menunggu
 * tindakan, siswa privat dengan sesi menipis, dan rekap operasional."
 */
export async function getAdminDashboardSummary() {
  const { start, end } = getTodayRangeUTC();
  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
  const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  const settings = await getSettings();
  const threshold = Math.max(
    0,
    Number(settings.lowQuotaWarningThreshold) || LOW_QUOTA_THRESHOLD,
  );

  const [
    todaySessionsCount,
    pendingValidationsCount,
    lowQuotaPackages,
    activeTutorsCount,
    activeStudentsCount,
    todaySessions,
    completedThisMonth,
    lowQuotaClasses,
  ] = await Promise.all([
    prisma.teachingSession.count({
      where: { sessionDate: { gte: start, lt: end } },
    }),
    prisma.sessionValidation.count({ where: { decision: "PENDING" } }),
    prisma.privatePackage.findMany({
      where: { status: "ACTIVE", quotaRemaining: { lte: threshold } },
      include: { student: { select: { name: true } } },
      orderBy: { quotaRemaining: "asc" },
    }),
    prisma.tutor.count({ where: { status: "ACTIVE", deletedAt: null } }),
    prisma.student.count({ where: { status: "ACTIVE" } }),
    // Sorted in JS below, not via `orderBy` on the `schedule` relation — Neon
    // production hit a Postgres error ("WITHIN GROUP is required for
    // ordered-set aggregate mode") on exactly this relation-orderBy shape
    // that never reproduced locally, so it's avoided outright rather than
    // chased further. Today's row count is small; sorting client-side after
    // fetch is cheap and sidesteps the whole class of risk.
    prisma.teachingSession.findMany({
      where: { sessionDate: { gte: start, lt: end } },
      include: {
        tutor: { select: { name: true } },
        class: { select: { name: true } },
        student: { select: { name: true } },
        subject: { select: { name: true } },
        schedule: { select: { startTime: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.teachingSession.findMany({
      where: {
        status: "COMPLETED",
        sessionDate: { gte: monthStart, lt: monthEnd },
        honorRateSnapshot: { not: null },
      },
      select: { honorRateSnapshot: true },
    }),
    prisma.class.findMany({
      where: { status: "ACTIVE", quotaRemaining: { lte: threshold } },
      select: { id: true, name: true, quotaRemaining: true, quotaTotal: true },
      orderBy: { quotaRemaining: "asc" },
      take: 8,
    }),
  ]);

  const sortedTodaySessions = [...todaySessions]
    .sort((a, b) => {
      const ta = a.schedule ? new Date(a.schedule.startTime).getTime() : new Date(a.createdAt).getTime();
      const tb = b.schedule ? new Date(b.schedule.startTime).getTime() : new Date(b.createdAt).getTime();
      return ta - tb;
    })
    .slice(0, 12);

  return {
    todaySessionsCount,
    pendingValidationsCount,
    lowQuotaPackages,
    activeTutorsCount,
    activeStudentsCount,
    completedSessionsThisMonth: completedThisMonth.length,
    estimatedHonorThisMonth: completedThisMonth.reduce(
      (total, session) => total + Number(session.honorRateSnapshot || 0),
      0,
    ),
    todaySessions: sortedTodaySessions,
    lowQuotaClasses,
    lowQuotaThreshold: threshold,
  };
}

/** Period-only aggregate used by the Admin dashboard month selector. */
export async function getAdminMonthlySummary(year: number, month: number) {
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new AppError("Bulan dan tahun tidak valid.", 400);
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const sessions = await prisma.teachingSession.findMany({
    where: { status: "COMPLETED", sessionDate: { gte: start, lt: end } },
    select: { sessionDate: true, sessionType: true, honorRateSnapshot: true },
  });
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weekly = Array.from({ length: Math.ceil(days / 7) }, (_, index) => ({
    startDay: index * 7 + 1,
    endDay: Math.min((index + 1) * 7, days),
    count: 0,
  }));
  let regularSessions = 0;
  let privateSessions = 0;
  let estimatedHonor = 0;
  for (const session of sessions) {
    if (session.sessionType === "REGULAR") regularSessions++;
    if (session.sessionType === "PRIVATE") privateSessions++;
    estimatedHonor += Number(session.honorRateSnapshot || 0);
    const day = session.sessionDate.getUTCDate();
    weekly[Math.floor((day - 1) / 7)].count++;
  }
  return {
    period: { year, month },
    estimatedHonor,
    completedSessions: sessions.length,
    regularSessions,
    privateSessions,
    weekly,
  };
}

/**
 * Beranda Tentor (section J): "jadwal hari ini, sesi berikutnya, sesi yang
 * belum diselesaikan, ringkasan mengajar."
 */
export async function getTutorDashboardSummary(tutorId: string) {
  const { start, end } = getTodayRangeUTC();

  // Quota + schedule.startTime included so Beranda can render the mockup's
  // "Isi Sesi" quick-action card (progress bar, and a locked/red state once
  // quota hits zero) without a second round-trip per session.
  const todaySessionInclude = {
    class: { select: { name: true, quotaTotal: true, quotaRemaining: true } },
    student: {
      select: {
        name: true,
        packages: {
          where: { status: "ACTIVE" as const },
          select: { quotaTotal: true, quotaRemaining: true },
          take: 1,
        },
      },
    },
    subject: { select: { name: true } },
    schedule: { select: { startTime: true, endTime: true } },
  };

  const [tutor, todaySessions, unfinishedSessions, totalCompletedSessions] =
    await Promise.all([
      prisma.tutor.findUnique({
        where: { id: tutorId },
        select: { name: true },
      }),
      prisma.teachingSession.findMany({
        where: { tutorId, sessionDate: { gte: start, lt: end } },
        include: todaySessionInclude,
        orderBy: { sessionDate: "asc" },
      }),
      prisma.teachingSession.findMany({
        where: {
          tutorId,
          status: { in: ["SCHEDULED", "IN_PROGRESS", "PENDING_ADMIN"] },
        },
        include: {
          class: { select: { name: true } },
          student: { select: { name: true } },
          subject: { select: { name: true } },
          schedule: { select: { startTime: true, endTime: true } },
        },
        orderBy: { sessionDate: "asc" },
      }),
      prisma.teachingSession.count({ where: { tutorId, status: "COMPLETED" } }),
    ]);

  return {
    tutorName: tutor?.name ?? null,
    todaySessions,
    unfinishedSessions,
    totalCompletedSessions,
  };
}
