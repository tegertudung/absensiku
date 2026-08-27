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
