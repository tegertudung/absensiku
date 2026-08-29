'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { StatusBadge, TypeBadge } from '@/components/StatusBadge';
import { IconWarning } from '@/components/icons';

interface Quota {
  quotaTotal: number;
  quotaRemaining: number;
}

interface SessionItem {
  id: string;
  sessionType: string;
  sessionDate: string;
  status: string;
  class?: (Quota & { name: string }) | null;
  student?: { name: string; packages?: Quota[] } | null;
  subject?: { name: string } | null;
  schedule?: { startTime: string; endTime: string } | null;
}

interface TentorDashboard {
  tutorName: string | null;
  todaySessions: SessionItem[];
  unfinishedSessions: SessionItem[];
  totalCompletedSessions: number;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function sessionQuota(s: SessionItem): Quota | null {
  return s.sessionType === 'REGULAR' ? s.class ?? null : s.student?.packages?.[0] ?? null;
}

export default function TentorHomePage() {
  const [data, setData] = useState<TentorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/dashboard/tentor')
      .then((res) => setData(res.data.data))
      .catch(() => setError('Gagal memuat data.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-gray-400">Memuat...</p>;
  if (error || !data) return <p className="text-sm text-red-500">{error ?? 'Data tidak tersedia.'}</p>;

  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Halo, {data.tutorName || 'Tentor'}!</h1>
        <p className="mt-0.5 text-sm text-gray-500">Berikut jadwal mengajar Anda hari ini, {today}.</p>
      </div>

      <div>
        {data.todaySessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center">
            <p className="text-sm text-gray-400">Tidak ada jadwal mengajar hari ini.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.todaySessions.map((s) => {
              const quota = sessionQuota(s);
              const isEmpty = quota != null && quota.quotaRemaining === 0;
              const canFillNow = s.status === 'IN_PROGRESS' || s.status === 'SCHEDULED';
              return (
                <div
                  key={s.id}
                  className={`rounded-xl border bg-white p-4 ${isEmpty ? 'border-red-200 bg-red-50/40' : 'border-gray-200'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <TypeBadge type={s.sessionType} />
                      {s.schedule && (
                        <span className="text-xs text-gray-500">
                          {formatTime(s.schedule.startTime)}–{formatTime(s.schedule.endTime)}
                        </span>
                      )}
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="mt-2 text-base font-semibold text-gray-900">
                    {s.sessionType === 'REGULAR' ? s.class?.name : s.student?.name}
                  </p>
                  {s.subject?.name && <p className="text-sm text-gray-500">{s.subject.name}</p>}

                  <div className="mt-3 border-t border-gray-100 pt-3">
                    {isEmpty ? (
                      <div className="flex gap-2 rounded-lg bg-red-100/70 px-3 py-2.5">
                        <IconWarning className="h-4 w-4 shrink-0 text-red-600" />
                        <p className="text-xs text-red-700">
                          {s.sessionType === 'REGULAR' ? 'Pertemuan kelas habis.' : 'Paket pertemuan habis.'} Hubungi
                          Admin untuk menambah kuota.
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        {quota && (
                          <p className="text-xs text-gray-500">
                            Progres Paket: <span className="font-medium text-gray-800">{quota.quotaTotal - quota.quotaRemaining}/{quota.quotaTotal}</span>
                          </p>
                        )}
                        <Link
                          href={`/tentor/sessions/${s.id}`}
                          className={`ml-auto rounded-lg bg-navy-900 px-4 py-2 text-xs font-medium text-white hover:bg-navy-800 ${
                            canFillNow ? '' : 'pointer-events-none opacity-40'
                          }`}
                        >
                          Isi Sesi
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-900 mb-2">Sesi Belum Selesai</h2>
        {data.unfinishedSessions.length === 0 ? (
          <p className="text-sm text-gray-400">Semua sesi sudah diselesaikan.</p>
        ) : (
          <ul className="space-y-2">
            {data.unfinishedSessions.map((s) => (
              <li key={s.id} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {s.sessionType === 'REGULAR' ? s.class?.name : s.student?.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(s.sessionDate).toLocaleDateString('id-ID')}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-navy-900 px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-navy-200">Total sesi selesai</span>
        <span className="text-xl font-semibold text-white">{data.totalCompletedSessions}</span>
      </div>

      <Link
        href="/tentor/private/new"
        className="block text-center text-sm font-medium text-navy-900 border border-navy-200 rounded-lg py-2.5"
      >
        + Tambah Jadwal Privat
      </Link>
    </div>
  );
}
