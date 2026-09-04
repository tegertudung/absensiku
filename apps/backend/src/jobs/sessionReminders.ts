import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { createNotification } from '../services/notificationService';

/**
 * Notifikasi Tentor (pengingat pertemuan): reminds the tutor 2 hours and 1
 * hour before a SCHEDULED meeting's startTime. Each threshold is gated by
 * its own `reminderXhSentAt` flag on TeachingSession (set the moment it's
 * sent) rather than a narrow time window — so a slow tick, a missed run, or
 * a process restart just catches up on the next sweep instead of double- or
 * never-sending. Meetings with no startTime (older pattern-derived rows)
 * have nothing to count down from and are skipped.
 */
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];
function formatWhen(sessionDate: Date, startTime: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${DAY_NAMES[sessionDate.getDay()]}, ${sessionDate.getDate()} ${MONTH_NAMES[sessionDate.getMonth()]} ${sessionDate.getFullYear()}, ${pad(startTime.getHours())}:${pad(startTime.getMinutes())}`;
}

async function sendDueReminders(hoursAhead: 2 | 1) {
  const field = hoursAhead === 2 ? 'reminder2hSentAt' : 'reminder1hSentAt';
  const title = hoursAhead === 2 ? 'Pertemuan 2 Jam Lagi' : 'Pertemuan 1 Jam Lagi';
  const now = new Date();
  const threshold = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  const due = await prisma.teachingSession.findMany({
    where: {
      status: 'SCHEDULED',
      // Only meetings still ahead of us, within this threshold's window —
      // a `lte: threshold` alone would also match a meeting whose startTime
      // is long past but that's still SCHEDULED (never opened by the
      // tutor), which would wrongly say "2 jam lagi" for a class already over.
      startTime: { gt: now, lte: threshold },
      [field]: null,
    },
    select: {
      id: true,
      tutorId: true,
      sessionDate: true,
      startTime: true,
      tutor: { select: { userId: true } },
    },
  });

  for (const session of due) {
    // startTime is guaranteed non-null by the `not: null` filter above.
    const when = formatWhen(session.sessionDate, session.startTime!);
    try {
      await createNotification({
        userId: session.tutor.userId,
        title,
        message: when,
        type: 'SCHEDULE_CHANGE',
      });
      await prisma.teachingSession.update({
        where: { id: session.id },
        data: { [field]: new Date() },
      });
    } catch (err) {
      // Leave the flag unset on failure so the next sweep retries this session.
      console.error(`[sessionReminders] ${hoursAhead}h reminder failed for session ${session.id}:`, err);
    }
  }

  return due.length;
}

export async function sendSessionReminders(): Promise<{ twoHour: number; oneHour: number }> {
  const [twoHour, oneHour] = await Promise.all([
    sendDueReminders(2),
    sendDueReminders(1),
  ]);
  if (twoHour + oneHour > 0) {
    console.log(`[sessionReminders] Sent ${twoHour} two-hour and ${oneHour} one-hour reminder(s)`);
  }
  return { twoHour, oneHour };
}

/**
 * Runs every 5 minutes — frequent enough that a reminder fires within a few
 * minutes of crossing its threshold without adding real load (one cheap,
 * indexed query pair per tick). Same in-process node-cron approach as
 * lockOverdueSessions — no Redis/worker infra in this app.
 */
export function startSessionReminderJob() {
  cron.schedule('*/5 * * * *', () => {
    sendSessionReminders().catch((err) => console.error('[sessionReminders] failed:', err));
  });
  console.log('✓ Session reminder job scheduled (every 5 minutes)');
}
