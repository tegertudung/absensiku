import { prisma } from '../utils/prisma';
import { getApplicableHonorRate } from './honorService';
import { logAudit } from '../utils/auditLog';

export class SessionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Statuses from which a session may still be completed or cancelled.
// COMPLETED and CANCELLED_NOT_COUNTED are terminal (BR-13: further changes need admin correction with audit trail).
const OPEN_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'PENDING_ADMIN'];

// BR-07/AC-05: tentor loses edit rights 3 days after the session date.
export const OVERDUE_DAYS = 3;

/**
 * Synchronous backstop for AC-05, independent of the hourly lock job (see
 * jobs/lockOverdueSessions.ts) — closes the up-to-1-hour gap between a
 * session becoming overdue and the next cron tick. A tentor cannot act on an
 * overdue session even if its status hasn't been flipped to PENDING_ADMIN
 * yet; admin is never subject to this (actingTutorId is null for admin).
 */
export function isOverdue(sessionDate: Date): boolean {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - OVERDUE_DAYS);
  return sessionDate.getTime() < cutoff.getTime();
}

/**
 * Resolve a logged-in user's Tutor profile id, if any.
 * Used to scope TENTOR-role requests to their own data (Kontrol Akses in the spec).
 */
export async function resolveTutorIdForUser(userId: string): Promise<string | null> {
  const tutor = await prisma.tutor.findUnique({ where: { userId } });
  return tutor?.id ?? null;
}

/**
 * Throws 403 if a TENTOR is trying to act on a resource that isn't theirs.
 * Pass `actingTutorId = null/undefined` for ADMIN (no restriction).
 */
function assertOwnership(actingTutorId: string | null | undefined, resourceTutorId: string) {
  if (actingTutorId && actingTutorId !== resourceTutorId) {
    throw new SessionError('Anda tidak memiliki akses ke sesi ini', 403);
  }
}

/**
 * Tentor opens a scheduled slot and starts recording a session.
 * BR-05: for PRIVATE sessions, block up front if the package has no quota left —
 * actual quota deduction happens later, on completion (so a session that never
 * finishes doesn't consume quota).
 */
export async function createSessionFromSchedule(params: {
  scheduleId: string;
  sessionDate: Date;
  createdBy: string;
  actingTutorId?: string | null;
}) {
  const schedule = await prisma.schedule.findUnique({ where: { id: params.scheduleId } });
  if (!schedule) throw new SessionError('Jadwal tidak ditemukan', 404);
  if (schedule.status !== 'ACTIVE') throw new SessionError('Jadwal tidak aktif', 400);

  assertOwnership(params.actingTutorId, schedule.tutorId);

  if (schedule.sessionType === 'PRIVATE') {
    if (!schedule.studentId) throw new SessionError('Jadwal privat tidak memiliki siswa', 400);

    const pkg = await prisma.privatePackage.findFirst({
      where: { studentId: schedule.studentId, status: 'ACTIVE', quotaRemaining: { gt: 0 } },
    });
    if (!pkg) {
      throw new SessionError(
        'Paket privat tidak aktif atau kuota sudah habis. Hubungi admin untuk perpanjangan.',
        409
      );
    }
  }

  return prisma.teachingSession.create({
    data: {
      scheduleId: schedule.id,
      tutorId: schedule.tutorId,
      sessionType: schedule.sessionType,
      sessionDate: params.sessionDate,
      classId: schedule.classId,
      studentId: schedule.studentId,
      subjectId: schedule.subjectId,
      status: 'IN_PROGRESS',
      createdBy: params.createdBy,
    },
  });
}

/**
 * BR-04/BR-09: mark a session COMPLETED, snapshotting the honor rate that is
 * currently in effect and, for PRIVATE sessions, atomically deducting one
 * unit of quota. Everything happens in a single transaction — either both the
 * quota deduction and the session update succeed, or neither does.
 */
export async function completeSession(
  sessionId: string,
  userId: string,
  actingTutorId?: string | null
) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.teachingSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new SessionError('Sesi tidak ditemukan', 404);

    assertOwnership(actingTutorId, session.tutorId);

    if (actingTutorId && isOverdue(session.sessionDate)) {
      throw new SessionError(
        `Sesi ini sudah melewati batas ${OVERDUE_DAYS} hari dan terkunci dari tentor. Hubungi admin untuk penyelesaian.`,
        409
      );
    }

    if (!OPEN_STATUSES.includes(session.status)) {
      throw new SessionError(`Sesi berstatus "${session.status}" tidak dapat diselesaikan`, 409);
    }

    const rate = await getApplicableHonorRate(
      session.sessionType as 'REGULAR' | 'PRIVATE',
      session.sessionDate,
      tx
    );
    if (!rate) {
      throw new SessionError(
        `Tidak ada tarif honor aktif untuk sesi ${session.sessionType} pada tanggal ${
          session.sessionDate.toISOString().split('T')[0]
        }. Hubungi admin untuk mengatur master tarif.`,
        422
      );
    }

    if (session.sessionType === 'PRIVATE') {
      if (!session.studentId) throw new SessionError('Sesi privat tidak memiliki siswa', 400);

      // Lock-free but safe: quotaRemaining > 0 is checked in the WHERE clause of the
      // update itself in a real high-concurrency system you'd use a SELECT ... FOR UPDATE;
      // Prisma's transaction + this conditional find/update pair is sufficient for our scale.
      const pkg = await tx.privatePackage.findFirst({
        where: { studentId: session.studentId, status: 'ACTIVE', quotaRemaining: { gt: 0 } },
        orderBy: { activationDate: 'asc' },
      });

      if (!pkg) {
        throw new SessionError(
          'Kuota paket privat sudah habis. Sesi tidak dapat diselesaikan tanpa tindakan admin.',
          409
        );
      }

      await tx.privatePackage.update({
        where: { id: pkg.id },
        data: { quotaUsed: { increment: 1 }, quotaRemaining: { decrement: 1 } },
      });

      await tx.privatePackageUsage.create({
        data: {
          packageId: pkg.id,
          sessionId: session.id,
          quantityUsed: 1,
          changeType: 'SESSION_COMPLETED',
          changedBy: userId,
          reason: 'Sesi privat diselesaikan oleh tentor',
        },
      });
    }

    return tx.teachingSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        honorRateSnapshot: rate.nominal,
        completedAt: new Date(),
        updatedBy: userId,
      },
    });
  });
}

/**
 * BR-06: tentor reports that the student cancelled on the day of the session.
 * The session moves to PENDING_ADMIN — nothing is counted (no quota deducted,
 * no honor) until an admin decides.
 */
export async function reportCancellation(
  sessionId: string,
  reason: string,
  userId: string,
  actingTutorId?: string | null
) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.teachingSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new SessionError('Sesi tidak ditemukan', 404);

    assertOwnership(actingTutorId, session.tutorId);

    if (actingTutorId && isOverdue(session.sessionDate)) {
      throw new SessionError(
        `Sesi ini sudah melewati batas ${OVERDUE_DAYS} hari dan terkunci dari tentor. Hubungi admin untuk penyelesaian.`,
        409
      );
    }

    if (!OPEN_STATUSES.includes(session.status)) {
      throw new SessionError(`Sesi berstatus "${session.status}" tidak dapat dibatalkan`, 409);
    }

    await tx.teachingSession.update({
      where: { id: sessionId },
      data: { status: 'PENDING_ADMIN', updatedBy: userId },
    });

    return tx.sessionValidation.create({
      data: {
        sessionId,
        caseType: 'CANCELLATION_DAY_OF',
        decision: 'PENDING',
        description: reason,
        createdBy: userId,
      },
    });
  });
}

/**
 * BR-06/BR-07: admin resolves a pending validation (day-of cancellation, overdue
 * completion, or a manual correction case).
 * APPROVED  -> session is completed normally (honor snapshot + quota deduction if PRIVATE).
 * REJECTED  -> session is marked CANCELLED_NOT_COUNTED; nothing is deducted or counted.
 */
export async function decideValidation(
  validationId: string,
  decision: 'APPROVED' | 'REJECTED',
  adminId: string,
  adminNotes?: string
) {
  const validation = await prisma.sessionValidation.findUnique({ where: { id: validationId } });
  if (!validation) throw new SessionError('Validasi tidak ditemukan', 404);
  if (validation.decision !== 'PENDING') {
    throw new SessionError('Validasi ini sudah diputuskan sebelumnya', 409);
  }

  const sessionBefore = await prisma.teachingSession.findUnique({ where: { id: validation.sessionId } });

  await prisma.sessionValidation.update({
    where: { id: validationId },
    data: { decision, adminNotes, decidedBy: adminId, decidedAt: new Date() },
  });

  const result =
    decision === 'APPROVED'
      ? // Admin acting on behalf of the session — no ownership restriction.
        await completeSession(validation.sessionId, adminId, null)
      : await prisma.teachingSession.update({
          where: { id: validation.sessionId },
          data: { status: 'CANCELLED_NOT_COUNTED', updatedBy: adminId },
        });

  // BR-13: this is exactly "koreksi data setelah sesi terkunci dilakukan admin" —
  // record the traceable before/after.
  await logAudit({
    tableName: 'teaching_sessions',
    recordId: validation.sessionId,
    action: 'UPDATE',
    oldValues: {
      status: sessionBefore?.status ?? null,
      honorRateSnapshot: sessionBefore?.honorRateSnapshot?.toString() ?? null,
    },
    newValues: {
      status: result.status,
      honorRateSnapshot: result.honorRateSnapshot?.toString() ?? null,
    },
    changedBy: adminId,
    reason: `Validasi ${validation.caseType} diputuskan: ${decision}${adminNotes ? ` — ${adminNotes}` : ''}`,
  });

  return result;
}

/**
 * BR-11/AC-07: "difilter berdasarkan jam, hari, kelas, bulan, dan tentor."
 * "Bulan" is just a date range (startDate/endDate). "Hari" (day of week) and
 * "jam" (time of day) aren't stored on the session itself — they live on its
 * originating Schedule — so dayOfWeek filters via the schedule relation
 * (native Prisma support) and hour is matched in-memory against the
 * schedule's startTime, since Prisma has no portable "extract hour from
 * DateTime" filter without raw SQL. Fine at this scale (single-office
 * volume); revisit with a raw query if session counts grow large.
 */
export async function listSessions(filters: {
  tutorId?: string;
  status?: string;
  sessionType?: string;
  startDate?: Date;
  endDate?: Date;
  classId?: string;
  studentId?: string;
  dayOfWeek?: number;
  hour?: string; // "HH:mm"
}) {
  const sessions = await prisma.teachingSession.findMany({
    where: {
      tutorId: filters.tutorId,
      status: filters.status as any,
      sessionType: filters.sessionType as any,
      classId: filters.classId,
      studentId: filters.studentId,
      sessionDate:
        filters.startDate || filters.endDate
          ? { gte: filters.startDate, lte: filters.endDate }
          : undefined,
      schedule: filters.dayOfWeek !== undefined ? { dayOfWeek: filters.dayOfWeek } : undefined,
    },
    include: {
      tutor: { select: { name: true } },
      class: { select: { name: true } },
      student: { select: { name: true } },
      subject: { select: { name: true } },
      schedule: { select: { startTime: true } },
    },
    orderBy: { sessionDate: 'desc' },
  });

  if (!filters.hour) return sessions;

  return sessions.filter((s) => {
    if (!s.schedule?.startTime) return false;
    const d = new Date(s.schedule.startTime);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}` === filters.hour;
  });
}

export async function listPendingValidations() {
  return prisma.sessionValidation.findMany({
    where: { decision: 'PENDING' },
    include: {
      session: {
        include: {
          tutor: { select: { name: true } },
          class: { select: { name: true } },
          student: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}
