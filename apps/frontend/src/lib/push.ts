import api from './api';

// PushManager.subscribe() needs the VAPID public key as a raw Uint8Array,
// not the base64url string the server hands out.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function getPushSubscriptionState(): Promise<'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  return existing ? 'subscribed' : 'unsubscribed';
}

/**
 * Requests notification permission (triggers the browser's native prompt if
 * not already answered), subscribes this device via the service worker, and
 * sends the subscription to the backend so it knows where to push to.
 */
export async function subscribeToPush(): Promise<'subscribed' | 'denied' | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const { data } = await api.get('/push/public-key');
  if (!data.data.configured || !data.data.publicKey) {
    // Backend has no VAPID keys set — nothing we can do client-side.
    return 'unsupported';
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.data.publicKey) as BufferSource,
  });

  await api.post('/push/subscribe', subscription.toJSON());
  return 'subscribed';
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await api.post('/push/unsubscribe', { endpoint }).catch(() => {});
}
