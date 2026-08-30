import { prisma } from '../utils/prisma';
import { sendPushToUser } from './pushService';

/**
 * Section J (Notifikasi Tentor): "ketika ada perubahan jadwal atau kelas
 * bentrok." Every notification is written to the DB (polled by the
 * NotificationBell, works even without push configured) and, best-effort,
 * also sent as a real Web Push so it reaches the user's phone/desktop even
 * when the app is closed — see pushService.ts. Push failures never block or
 * fail notification creation itself.
 */
export async function createNotification(data: {
  userId: string;
  title: string;
  message: string;
  type?: string;
}) {
  const notification = await prisma.notification.create({
    data: {
      userId: data.userId,
      title: data.title,
      message: data.message,
      type: data.type || 'SCHEDULE_CHANGE',
    },
  });

  sendPushToUser(data.userId, { title: data.title, body: data.message }).catch((err) =>
    console.error('[push] sendPushToUser failed:', err)
  );

  return notification;
}

export async function listNotificationsForUser(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function markNotificationRead(id: string, userId: string) {
  // Scoped to the owning user directly in the WHERE clause — updateMany
  // silently no-ops if the notification belongs to someone else, rather
  // than needing a separate ownership-check round trip.
  return prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });
}

export async function markAllNotificationsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

/**
 * Notifikasi Orang Tua (Tier 1): every Parent account linked to this
 * student gets the same notification — a student can have more than one
 * linked parent (Ayah + Ibu), and both should know.
 */
export async function notifyParentsOfStudent(
  studentId: string,
  data: { title: string; message: string; type?: string }
) {
  const links = await prisma.parentStudent.findMany({
    where: { studentId },
    select: { parent: { select: { userId: true } } },
  });
  await Promise.all(links.map((link) => createNotification({ userId: link.parent.userId, ...data })));
}

/**
 * Same as notifyParentsOfStudent, but for a REGULAR class whose quota is
 * shared across every actively-enrolled student — every parent of every
 * currently-active student in the class is notified, each with a message
 * built around their own child's name (`build`) rather than one identical
 * blast, so "kelas yang diikuti [nama anak]" is actually their child.
 */
export async function notifyParentsOfClass(
  classId: string,
  build: (studentName: string) => { title: string; message: string; type?: string }
) {
  const enrollments = await prisma.classEnrollment.findMany({
    where: { classId, status: 'ACTIVE' },
    select: {
      student: {
        select: {
          name: true,
          parentLinks: { select: { parent: { select: { userId: true } } } },
        },
      },
    },
  });
  const tasks = enrollments.flatMap((e) => {
    const data = build(e.student.name);
    return e.student.parentLinks.map((link) => createNotification({ userId: link.parent.userId, ...data }));
  });
  await Promise.all(tasks);
}
