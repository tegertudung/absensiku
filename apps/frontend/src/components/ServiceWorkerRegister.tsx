'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker on first client render. Silent no-op if the
 * browser doesn't support it (e.g. some in-app webviews) — PWA features are
 * an enhancement, never a requirement for the app to function.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    }
  }, []);

  return null;
}
