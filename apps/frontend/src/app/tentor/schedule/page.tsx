'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { StatusBadge, TypeBadge } from '@/components/StatusBadge';

interface ScheduleItem {
  id: string;
  sessionType: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  class?: { name: string; quotaRemaining: number; quotaTotal: number } | null;
  student?: { name: string; packages?: Array<{ quotaRemaining: number; quotaTotal: number }> } | null;
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
  material?: string | null;
  progressNotes?: string | null;
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];

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
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState<string[]>([]);
  const [batchSuccess, setBatchSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schedRes, sessRes] = await Promise.all([
        api.get('/schedules'),
        api.get('/sessions', { params: { startDate: todayISODate(), endDate: todayISODate() } }),
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

  const todaySessions = activeSessions;
  const readySessions = todaySessions.filter((s) => s.status === 'IN_PROGRESS' && Boolean(s.material?.trim()) && (s.sessionType === 'REGULAR' || Boolean(s.progressNotes?.trim())));
  const incompleteSessions = todaySessions.filter((s) => s.status === 'IN_PROGRESS' && !readySessions.some((ready) => ready.id === s.id));
  async function completeBatch() {
    setBatchBusy(true); setBatchError([]); setBatchSuccess(null);
    try {
      const res = await api.post('/sessions/complete-batch', { date: todayISODate(), sessionIds: readySessions.map((s) => s.id) });
      setShowBatchConfirm(false); setBatchSuccess(`${res.data.data.completedCount} sesi berhasil diselesaikan.`); await load();
    } catch (err: any) {
      const data = err.response?.data;
      setBatchError(data?.issues?.map((issue: any) => issue.message) || [data?.message || 'Gagal menyelesaikan sesi.']);
    } finally { setBatchBusy(false); }
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
      {batchSuccess && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{batchSuccess}</p>}
      {batchError.length > 0 && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2"><p className="font-medium">Beberapa sesi belum dapat diselesaikan.</p><ul className="mt-1 list-disc pl-5">{batchError.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h1 className="text-base font-semibold text-gray-900">Jadwal Hari Ini</h1>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm"><p>Total Jadwal: <strong>{todaySessions.length}</strong></p><p>Sudah Diisi: <strong>{readySessions.length}</strong></p><p>Belum Lengkap: <strong>{incompleteSessions.length}</strong></p><p>Selesai: <strong>{todaySessions.filter((s) => s.status === 'COMPLETED').length}</strong></p></div>
        {incompleteSessions.length > 0 && <p className="mt-3 text-xs text-amber-700">{readySessions.length} dari {todaySessions.length} sesi siap diselesaikan. {incompleteSessions.length} sesi belum lengkap.</p>}
      </section>

      <div>
        <h2 className="text-sm font-medium text-gray-900 mb-2">Sesi Aktif</h2>
        {activeSessions.length === 0 ? (
          <p className="text-sm text-gray-400">Tidak ada sesi yang sedang berjalan.</p>
        ) : (
          <ul className="space-y-2">
            {activeSessions.map((s) => (
              <li key={s.id} className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-amber-400 p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {s.sessionType === 'REGULAR' ? s.class?.name : s.student?.name}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-1">
                      <TypeBadge type={s.sessionType} />
                      {s.subject?.name} &middot; {new Date(s.sessionDate).toLocaleDateString('id-ID')}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <Link href={`/tentor/sessions/${s.id}`} className="block text-center text-xs font-medium text-navy-900 border border-navy-200 rounded-md py-2 mb-2 hover:bg-navy-50">Isi Catatan Sesi</Link>
                <div className="flex gap-2">
                  <button
                    onClick={() => completeSession(s.id)}
                    disabled={busyId === s.id}
                    className="flex-1 text-xs font-medium text-white bg-navy-900 rounded-md py-2 disabled:opacity-60 hover:bg-navy-800"
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

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <button onClick={() => setShowBatchConfirm(true)} disabled={readySessions.length === 0 || batchBusy} className="w-full rounded-md bg-navy-900 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{batchBusy ? 'Menyelesaikan...' : 'Selesaikan Semua Kelas Hari Ini'}</button>
        {readySessions.length === 0 && <p className="mt-2 text-center text-xs text-gray-500">Belum ada sesi yang siap diselesaikan.</p>}
      </section>

      <div>
        <h2 className="text-sm font-medium text-gray-900 mb-2">Jadwal Rutin</h2>
        {schedules.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada jadwal.</p>
        ) : (
          <ul className="space-y-2">
            {schedules.map((sch) => (
              <li key={sch.id} className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-navy-200 p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {sch.sessionType === 'REGULAR' ? sch.class?.name : sch.student?.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {DAY_NAMES[sch.dayOfWeek]}, {formatTime(sch.startTime)}–{formatTime(sch.endTime)}{' '}
                      &middot; {sch.subject?.name}
                    </p>
                  </div>
                  <TypeBadge type={sch.sessionType} />
                </div>
                <button
                  onClick={() => startSession(sch.id)}
                  disabled={busyId === sch.id || (sch.sessionType === 'REGULAR' ? sch.class?.quotaRemaining === 0 : sch.student?.packages?.[0]?.quotaRemaining === 0)}
                  className="w-full text-xs font-medium text-white bg-navy-900 rounded-md py-2 disabled:opacity-60 hover:bg-navy-800"
                >
                  {busyId === sch.id ? 'Memproses...' : (sch.sessionType === 'REGULAR' ? sch.class?.quotaRemaining === 0 ? 'Pertemuan Kelas Habis' : 'Mulai Kelas' : sch.student?.packages?.[0]?.quotaRemaining === 0 ? 'Paket Pertemuan Habis' : 'Mulai Kelas')}
                </button>
                <Link
                  href={`/tentor/schedule/${sch.id}/ajukan`}
                  className="mt-2 block text-center text-[11px] font-medium text-navy-700 hover:underline"
                >
                  Ajukan Perubahan Jadwal
                </Link>
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

      {showBatchConfirm && <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"><div className="w-full max-w-sm rounded-lg bg-white p-4"><h3 className="text-base font-semibold text-gray-900">Selesaikan Kelas Hari Ini?</h3><p className="mt-1 text-sm text-gray-600">{readySessions.length} sesi siap diselesaikan.</p><ul className="mt-3 space-y-2 text-xs text-gray-700">{readySessions.map((s) => <li key={s.id}>{s.sessionType === 'REGULAR' ? 'Reguler' : 'Privat'} — {s.sessionType === 'REGULAR' ? s.class?.name : s.student?.name}</li>)}</ul><div className="mt-4 flex gap-2"><button onClick={() => setShowBatchConfirm(false)} disabled={batchBusy} className="flex-1 rounded-md border border-gray-300 py-2 text-xs">Batal</button><button onClick={completeBatch} disabled={batchBusy} className="flex-1 rounded-md bg-navy-900 py-2 text-xs font-medium text-white">{batchBusy ? 'Menyelesaikan...' : `Selesaikan ${readySessions.length} Sesi`}</button></div></div></div>}
    </div>
  );
}
