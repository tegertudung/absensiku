'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

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

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Terjadwal',
  IN_PROGRESS: 'Dalam Proses',
  PENDING_ADMIN: 'Menunggu Admin',
  COMPLETED: 'Selesai',
  CANCELLED_NOT_COUNTED: 'Dibatalkan',
};

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

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-xs text-gray-500">Total sesi selesai</p>
        <p className="text-2xl font-semibold text-gray-900 mt-1">{data.totalCompletedSessions}</p>
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-900 mb-2">Jadwal Hari Ini</h2>
        {data.todaySessions.length === 0 ? (
          <p className="text-sm text-gray-400">Tidak ada sesi hari ini.</p>
        ) : (
          <ul className="space-y-2">
            {data.todaySessions.map((s) => (
              <li key={s.id} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {s.sessionType === 'REGULAR' ? s.class?.name : s.student?.name}
                    </p>
                    <p className="text-xs text-gray-500">{s.subject?.name}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
                    {STATUS_LABELS[s.status] ?? s.status}
                  </span>
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
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                    {STATUS_LABELS[s.status] ?? s.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
