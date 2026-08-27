import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { OVERDUE_DAYS } from '../services/sessionService';

/**
 * BR-07 / alur H.4: a tentor has 3 days after the session date to finish
 * recording it. Sessions still SCHEDULED/IN_PROGRESS past that window are
 * moved to PENDING_ADMIN with an OVERDUE_COMPLETION validation case —
 * reusing the same admin decide flow already built for day-of cancellations
 * (see /admin/validations), rather than inventing a parallel "Terkunci"
 * status. The doc's "sesi dikunci dari perubahan tentor" effect is what
 * PENDING_ADMIN already means in this system (attendanceService and
 * sessionService both already block tentor edits on that status).
 */
export async function lockOverdueSessions(): Promise<number> {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - OVERDUE_DAYS);

  const overdue = await prisma.teachingSession.findMany({
    where: {
      status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
      sessionDate: { lt: cutoff },
    },
  });

  for (const session of overdue) {
    await prisma.$transaction(async (tx) => {
      await tx.teachingSession.update({
        where: { id: session.id },
        data: { status: 'PENDING_ADMIN' },
      });

      await tx.sessionValidation.create({
        data: {
          sessionId: session.id,
          caseType: 'OVERDUE_COMPLETION',
          decision: 'PENDING',
          description: `Sesi tanggal ${
            session.sessionDate.toISOString().split('T')[0]
          } melewati batas ${OVERDUE_DAYS} hari tanpa diselesaikan tentor.`,
        },
      });
    });
  }

  if (overdue.length > 0) {
    console.log(`[lockOverdueSessions] Locked ${overdue.length} overdue session(s)`);
  }

  return overdue.length;
}

/**
 * Runs hourly. In-process node-cron rather than BullMQ+Redis — this app has
 * no Redis/worker infrastructure actually running, and standing one up
 * solely for a once-an-hour sweep on a single-admin-office scale system is
 * disproportionate. Revisit if the app grows multi-instance (in-process cron
 * would then fire once per instance, which needs a distributed lock).
 */
export function startOverdueSessionLockJob() {
  cron.schedule('0 * * * *', () => {
    lockOverdueSessions().catch((err) => console.error('[lockOverdueSessions] failed:', err));
  });
  console.log('✓ Overdue session lock job scheduled (hourly)');
}
