import webpush from 'web-push';
import { prisma } from '../utils/prisma';

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;

const vapidConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (vapidConfigured) {
  webpush.setVapidDetails(
    VAPID_SUBJECT || 'mailto:admin@pionerclass.com',
    VAPID_PUBLIC_KEY!,
    VAPID_PRIVATE_KEY!
  );
} else {
  // Not fatal — the rest of the app (in-app notification bell) works fine
  // without push configured. Just means saveSubscription/sendPushToUser are
  // no-ops until VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are set in .env.
  console.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — web push is disabled.');
}

export function isPushConfigured() {
  return vapidConfigured;
}

export async function saveSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    create: {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  });
}

export async function removeSubscription(endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

/**
 * Sends a push to every device the user has subscribed on. Best-effort: a
 * failed send (expired/revoked subscription — common, browsers drop these
 * silently) just deletes that row and moves on, it never throws back to the
 * caller. Push is a bonus delivery channel on top of the in-app notification
 * bell (see notificationService), never the only record of a notification.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string }
) {
  if (!vapidConfigured) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err: any) {
        // 404/410 = the push service says this subscription is gone for good.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error(`[push] failed to send to subscription ${sub.id}:`, err?.message || err);
        }
      }
    })
  );
}
