'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { IconLogout } from '@/components/icons';

interface TentorDashboard {
  totalCompletedSessions: number;
}

export default function TentorProfilePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [summary, setSummary] = useState<TentorDashboard | null>(null);

  useEffect(() => {
    api
      .get('/dashboard/tentor')
      .then((res) => setSummary(res.data.data))
      .catch(() => {});
  }, []);

  const initial = (user?.email || 'T').slice(0, 1).toUpperCase();

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full bg-navy-900 text-white flex items-center justify-center text-xl font-semibold">
          {initial}
        </div>
        <p className="text-sm font-medium text-gray-900 mt-3">{user?.email}</p>
        <p className="text-xs text-gray-500">Tentor</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-xs text-gray-500">Total Sesi Selesai</p>
        <p className="text-2xl font-semibold text-gray-900 mt-1">{summary?.totalCompletedSessions ?? '-'}</p>
      </div>

      <button
        onClick={() => {
          logout();
          router.push('/login');
        }}
        className="w-full flex items-center justify-center gap-2 rounded-md border border-red-200 text-red-600 text-sm font-medium py-2.5"
      >
        <IconLogout className="w-4 h-4" />
        Keluar
      </button>
    </div>
  );
}
