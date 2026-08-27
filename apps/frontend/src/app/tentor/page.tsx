'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { StatusBadge, TypeBadge } from '@/components/StatusBadge';

interface SessionItem {
  id: string;
  sessionType: string;
  sessionDate: string;
  status: string;
  class?: { name: string } | null;
  student?: { name: string } | null;
  subject?: { name: string } | null;
}

interface TentorDashboard {
  todaySessions: SessionItem[];
  unfinishedSessions: SessionItem[];
  totalCompletedSessions: number;
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
      {/* Welcome banner — navy, mirrors the mockup's Beranda header card */}
      <div className="bg-navy-900 rounded-lg p-4 text-white">
        <p className="text-xs text-navy-200">Halo, Tentor!</p>
        <p className="text-sm font-medium mt-0.5 capitalize">{today}</p>
        <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
          <span className="text-xs text-navy-200">Total sesi selesai</span>
          <span className="text-xl font-semibold">{data.totalCompletedSessions}</span>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-900 mb-2">Jadwal Hari Ini</h2>
        {data.todaySessions.length === 0 ? (
          <p className="text-sm text-gray-400">Tidak ada sesi hari ini.</p>
        ) : (
          <ul className="space-y-2">
            {data.todaySessions.map((s) => (
              <li key={s.id} className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-navy-900 p-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {s.sessionType === 'REGULAR' ? s.class?.name : s.student?.name}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-1">
                      <TypeBadge type={s.sessionType} />
                      {s.subject?.name}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              </li>
            ))}
          </ul>
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

      <Link
        href="/tentor/private/new"
        className="block text-center text-sm font-medium text-navy-900 border border-navy-200 rounded-md py-2.5"
      >
        + Tambah Jadwal Privat
      </Link>
    </div>
  );
}
