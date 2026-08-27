'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { getPushSubscriptionState, subscribeToPush } from '@/lib/push';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [pushState, setPushState] = useState<'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'>('unsupported');
  const [enabling, setEnabling] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.data);
    } catch {
      // notifications are non-critical, fail silently
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    getPushSubscriptionState().then(setPushState).catch(() => {});
  }, [open]);

  async function handleEnablePush() {
    setEnabling(true);
    try {
      const result = await subscribeToPush();
      setPushState(result === 'subscribed' ? 'subscribed' : result === 'denied' ? 'denied' : 'unsupported');
    } finally {
      setEnabling(false);
    }
  }

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch {
      load();
    }
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative p-1" aria-label="Notifikasi">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-80 overflow-y-auto">
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-900">Notifikasi</p>
            </div>
            {pushState === 'unsubscribed' && (
              <div className="px-3 py-2 border-b border-gray-100 bg-navy-50 flex items-center justify-between gap-2">
                <p className="text-[11px] text-navy-800">Aktifkan notifikasi langsung ke HP/desktop?</p>
                <button
                  onClick={handleEnablePush}
                  disabled={enabling}
                  className="text-[11px] font-medium text-white bg-navy-900 rounded-md px-2 py-1 shrink-0 disabled:opacity-60"
                >
                  {enabling ? '...' : 'Aktifkan'}
                </button>
              </div>
            )}
            {pushState === 'denied' && (
              <div className="px-3 py-2 border-b border-gray-100 bg-amber-50">
                <p className="text-[11px] text-amber-700">
                  Notifikasi diblokir di browser ini. Aktifkan lewat pengaturan izin situs untuk menerima notifikasi
                  langsung ke perangkat.
                </p>
              </div>
            )}
            {notifications.length === 0 ? (
              <p className="px-3 py-4 text-xs text-gray-400">Tidak ada notifikasi.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`w-full text-left px-3 py-2 border-b border-gray-50 last:border-0 ${
                    n.isRead ? 'bg-white' : 'bg-blue-50'
                  }`}
                >
                  <p className="text-xs font-medium text-gray-900">{n.title}</p>
                  <p className="text-xs text-gray-500">{n.message}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(n.createdAt).toLocaleString('id-ID')}
                  </p>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
