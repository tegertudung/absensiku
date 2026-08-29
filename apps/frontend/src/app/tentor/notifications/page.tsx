'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { getPushSubscriptionState, subscribeToPush } from '@/lib/push';
import { IconChevronLeft, IconWarning, IconCheckCircle, IconInfo } from '@/components/icons';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

function dayGroupLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Hari Ini';
  if (sameDay(date, yesterday)) return 'Kemarin';
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit yang lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam yang lalu`;
  return new Date(iso).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

const TYPE_STYLE: Record<string, { bg: string; text: string; icon: typeof IconInfo }> = {
  SCHEDULE_CONFLICT: { bg: 'bg-red-50', text: 'text-red-600', icon: IconWarning },
  SCHEDULE_CHANGE: { bg: 'bg-green-50', text: 'text-green-600', icon: IconCheckCircle },
  GENERAL: { bg: 'bg-amber-50', text: 'text-amber-600', icon: IconInfo },
};

export default function TentorNotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushState, setPushState] = useState<'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'>('unsupported');
  const [enabling, setEnabling] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.data);
    } catch {
      // non-critical, fail silently — page still renders with an empty list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getPushSubscriptionState().then(setPushState).catch(() => {});
  }, []);

  async function handleEnablePush() {
    setEnabling(true);
    setPushError(null);
    try {
      const result = await subscribeToPush();
      setPushState(result === 'subscribed' ? 'subscribed' : result === 'denied' ? 'denied' : 'unsupported');
      if (result !== 'subscribed') {
        setPushError(result === 'denied' ? 'Izin notifikasi ditolak di browser ini.' : 'Perangkat/browser ini tidak mendukung push notification.');
      }
    } catch (err: any) {
      setPushError(err?.message || 'Gagal mengaktifkan notifikasi (error tidak diketahui).');
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

  // Group in-order (API already returns newest-first) without reshuffling —
  // just insert a header whenever the day-label changes.
  const groups: Array<{ label: string; items: NotificationItem[] }> = [];
  for (const n of notifications) {
    const label = dayGroupLabel(n.createdAt);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === label) lastGroup.items.push(n);
    else groups.push({ label, items: [n] });
  }

  return (
    <div className="-mx-4 -mt-4">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-4">
        <button onClick={() => router.back()} aria-label="Kembali" className="flex h-11 w-11 items-center justify-center -m-2.5 text-gray-700">
          <IconChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Notifikasi</h1>
      </header>

      <div className="px-4 py-4 space-y-5">
        {pushState === 'unsubscribed' && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-navy-100 bg-navy-50 px-4 py-3">
            <p className="text-xs text-navy-800">Aktifkan notifikasi langsung ke HP/desktop?</p>
            <button
              onClick={handleEnablePush}
              disabled={enabling}
              className="shrink-0 rounded-lg bg-navy-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
            >
              {enabling ? '...' : 'Aktifkan'}
            </button>
          </div>
        )}
        {pushState === 'denied' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs text-amber-700">
              Notifikasi diblokir di browser ini. Aktifkan lewat pengaturan izin situs untuk menerima notifikasi
              langsung ke perangkat.
            </p>
          </div>
        )}
        {pushError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-xs font-medium text-red-700">Gagal mengaktifkan notifikasi:</p>
            <p className="text-xs text-red-600 break-words">{pushError}</p>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada notifikasi.</p>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <h2 className="mb-2 text-sm font-semibold text-gray-900">{group.label}</h2>
              <div className="space-y-3">
                {group.items.map((n) => {
                  const style = TYPE_STYLE[n.type] ?? TYPE_STYLE.GENERAL;
                  const Icon = style.icon;
                  return (
                    <button
                      key={n.id}
                      onClick={() => markRead(n.id)}
                      className={`flex w-full items-start gap-3 rounded-xl px-4 py-3.5 text-left transition-colors ${
                        n.isRead ? 'bg-gray-50' : 'bg-white ring-1 ring-navy-100'
                      }`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.bg} ${style.text}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                        <p className="mt-0.5 text-sm text-gray-600">{n.message}</p>
                        <p className="mt-1.5 text-xs text-gray-400">{relativeTime(n.createdAt)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
