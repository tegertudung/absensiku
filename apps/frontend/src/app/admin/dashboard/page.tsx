'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface LowQuotaPackage {
  id: string;
  quotaRemaining: number;
  student: { name: string };
}

interface DashboardData {
  todaySessionsCount: number;
  pendingValidationsCount: number;
  lowQuotaPackages: LowQuotaPackage[];
  activeTutorsCount: number;
  activeStudentsCount: number;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/dashboard/admin')
      .then((res) => setData(res.data.data))
      .catch(() => setError('Gagal memuat dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-gray-400">Memuat dashboard...</p>;
  if (error || !data) return <p className="text-sm text-red-500">{error ?? 'Data tidak tersedia.'}</p>;

  const cards = [
    { label: 'Sesi Hari Ini', value: data.todaySessionsCount },
    { label: 'Menunggu Validasi', value: data.pendingValidationsCount },
    { label: 'Tentor Aktif', value: data.activeTutorsCount },
    { label: 'Siswa Aktif', value: data.activeStudentsCount },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => {
          const needsAction = c.label === 'Menunggu Validasi' && c.value > 0;
          return (
            <div
              key={c.label}
              className={`bg-white rounded-lg border border-gray-200 p-4 ${
                needsAction ? 'border-l-4 border-l-red-400' : ''
              }`}
            >
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">{c.value}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-900 mb-3">Siswa Privat dengan Sesi Menipis</h2>
        {data.lowQuotaPackages.length === 0 ? (
          <p className="text-sm text-gray-400">Tidak ada siswa dengan kuota menipis.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.lowQuotaPackages.map((pkg) => (
              <li key={pkg.id} className="py-2 flex justify-between text-sm">
                <span className="text-gray-700">{pkg.student.name}</span>
                <span className="text-amber-600 font-medium">{pkg.quotaRemaining} sesi tersisa</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
