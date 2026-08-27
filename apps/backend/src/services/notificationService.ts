import { prisma } from '../utils/prisma';

/**
 * Section J (Notifikasi Tentor): "ketika ada perubahan jadwal atau kelas
 * bentrok." Implemented as simple in-app notifications (polled by the
 * frontend), not push/websocket — no realtime infrastructure exists in this
 * app yet. Schedule-change notifications are wired in; conflict detection
 * ("kelas bentrok") is NOT implemented — flagging that honestly rather than
 * pretending partial coverage is the whole feature.
 */
export async function createNotification(data: {
  userId: string;
  title: string;
  message: string;
  type?: string;
}) {
  return prisma.notification.create({
    data: {
      userId: data.userId,
      title: data.title,
      message: data.message,
      type: data.type || 'SCHEDULE_CHANGE',
    },
  });
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
