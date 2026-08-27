'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

interface ScheduleItem {
  id: string;
  sessionType: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  class?: { name: string } | null;
  student?: { name: string } | null;
  subject?: { name: string } | null;
}

interface SessionItem {
  id: string;
  sessionType: string;
  sessionDate: string;
  status: string;
  class?: { name: string } | null;
  student?: { name: string } | null;
  subject?: { name: string } | null;
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Terjadwal',
  IN_PROGRESS: 'Dalam Proses',
  PENDING_ADMIN: 'Menunggu Admin',
  COMPLETED: 'Selesai',
  CANCELLED_NOT_COUNTED: 'Dibatalkan',
};

// NOTE: startTime/endTime are stored as full DateTime values combined from a
// date + "HH:mm" at creation time, interpreted in the server's local timezone.
// Reading them back with local Date methods correctly reverses that as long as
// the viewer's browser is in the same timezone as the server (true for real
// deployment — single-region Indonesian usage). A future hardening pass should
// store these as plain "HH:mm" strings to remove the ambiguity entirely.
function formatTime(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function todayISODate() {
  return new Date().toISOString().split('T')[0];
}

export default function TentorSchedulePage() {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [activeSessions, setActiveSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schedRes, sessRes] = await Promise.all([
        api.get('/schedules'),
        api.get('/sessions', { params: { status: 'IN_PROGRESS' } }),
      ]);
      setSchedules(schedRes.data.data);
      setActiveSessions(sessRes.data.data);
    } catch {
      setActionError('Gagal memuat data jadwal.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function startSession(scheduleId: string) {
    setActionError(null);
    setBusyId(scheduleId);
    try {
      await api.post('/sessions', { scheduleId, sessionDate: todayISODate() });
      await load();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Gagal memulai sesi.');
    } finally {
      setBusyId(null);
    }
  }

  async function completeSession(sessionId: string) {
    setActionError(null);
    setBusyId(sessionId);
    try {
      await api.post(`/sessions/${sessionId}/complete`);
      await load();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Gagal menyelesaikan sesi.');
    } finally {
      setBusyId(null);
    }
  }

  async function submitCancellation() {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 3) {
      setActionError('Alasan pembatalan minimal 3 karakter.');
      return;
    }
    setActionError(null);
    setBusyId(cancelTarget);
    try {
      await api.post(`/sessions/${cancelTarget}/cancel`, { reason: cancelReason.trim() });
      setCancelTarget(null);
      setCancelReason('');
      await load();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Gagal melaporkan pembatalan.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Memuat jadwal...</p>;

  return (
    <div className="space-y-6">
      {actionError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {actionError}
        </p>
      )}

      <div>
        <h2 className="text-sm font-medium text-gray-900 mb-2">Sesi Aktif</h2>
        {activeSessions.length === 0 ? (
          <p className="text-sm text-gray-400">Tidak ada sesi yang sedang berjalan.</p>
        ) : (
          <ul className="space-y-2">
            {activeSessions.map((s) => (
              <li key={s.id} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {s.sessionType === 'REGULAR' ? s.class?.name : s.student?.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {s.subject?.name} &middot; {new Date(s.sessionDate).toLocaleDateString('id-ID')}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">
                    {STATUS_LABELS[s.status] ?? s.status}
                  </span>
                </div>
                {s.sessionType === 'REGULAR' && (
                  <Link
                    href={`/tentor/sessions/${s.id}/attendance`}
                    className="block text-center text-xs font-medium text-blue-600 border border-blue-200 rounded-md py-2 mb-2 hover:bg-blue-50"
                  >
                    Isi Absensi Siswa
                  </Link>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => completeSession(s.id)}
                    disabled={busyId === s.id}
                    className="flex-1 text-xs font-medium text-white bg-blue-600 rounded-md py-2 disabled:opacity-60"
                  >
                    {busyId === s.id ? 'Memproses...' : 'Selesaikan'}
                  </button>
                  <button
                    onClick={() => setCancelTarget(s.id)}
                    disabled={busyId === s.id}
                    className="flex-1 text-xs font-medium text-red-600 border border-red-200 rounded-md py-2 disabled:opacity-60"
                  >
                    Laporkan Pembatalan
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-900 mb-2">Jadwal Rutin</h2>
        {schedules.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada jadwal.</p>
        ) : (
          <ul className="space-y-2">
            {schedules.map((sch) => (
              <li key={sch.id} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="mb-2">
                  <p className="text-sm font-medium text-gray-900">
                    {sch.sessionType === 'REGULAR' ? sch.class?.name : sch.student?.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {DAY_NAMES[sch.dayOfWeek]}, {formatTime(sch.startTime)}–{formatTime(sch.endTime)}{' '}
                    &middot; {sch.subject?.name}
                  </p>
                </div>
                <button
                  onClick={() => startSession(sch.id)}
                  disabled={busyId === sch.id}
                  className="w-full text-xs font-medium text-white bg-green-600 rounded-md py-2 disabled:opacity-60"
                >
                  {busyId === sch.id ? 'Memproses...' : 'Mulai Sesi Hari Ini'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {cancelTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-20">
          <div className="bg-white rounded-lg p-4 w-full max-w-sm">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Laporkan Pembatalan Hari-H</h3>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-3"
              rows={3}
              placeholder="Alasan pembatalan (min. 3 karakter)"
            />
            <div className="flex gap-2">
              <button
                onClick={submitCancellation}
                disabled={busyId === cancelTarget}
                className="flex-1 text-xs font-medium text-white bg-red-600 rounded-md py-2 disabled:opacity-60"
              >
                Kirim
              </button>
              <button
                onClick={() => {
                  setCancelTarget(null);
                  setCancelReason('');
                }}
                className="flex-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-md py-2"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
