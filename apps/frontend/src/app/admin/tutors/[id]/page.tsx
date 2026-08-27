'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { formatRupiah, formatDate } from '@/lib/format';
import { StatusBadge, TypeBadge } from '@/components/StatusBadge';

interface TutorDetail {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  hireDate: string | null;
  user: { email: string; isActive: boolean; lastLogin: string | null };
}

interface ScheduleRow {
  id: string;
  sessionType: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  status: string;
  class: { name: string } | null;
  student: { name: string } | null;
  subject: { name: string } | null;
}

interface SessionRow {
  id: string;
  sessionDate: string;
  sessionType: string;
  status: string;
  honorRateSnapshot: string | null;
  class: { name: string } | null;
  student: { name: string } | null;
  subject: { name: string } | null;
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AdminTutorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tutorId = params.id as string;

  const [tutor, setTutor] = useState<TutorDetail | null>(null);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tutorRes, scheduleRes, sessionRes] = await Promise.all([
        api.get(`/tutors/${tutorId}`),
        api.get('/schedules', { params: { tutorId } }),
        api.get('/sessions', { params: { tutorId } }),
      ]);
      setTutor(tutorRes.data.data);
      setSchedules(scheduleRes.data.data);
      setSessions(sessionRes.data.data);
    } finally {
      setLoading(false);
    }
  }, [tutorId]);

  useEffect(() => {
    load();
  }, [load]);

  const totalCompleted = sessions.filter((s) => s.status === 'COMPLETED').length;
  const totalHonor = sessions
    .filter((s) => s.status === 'COMPLETED')
    .reduce((sum, s) => sum + Number(s.honorRateSnapshot || 0), 0);

  if (loading) return <p className="text-sm text-gray-400">Memuat...</p>;
  if (!tutor) return <p className="text-sm text-red-500">Tentor tidak ditemukan.</p>;

  return (
    <div>
      <button onClick={() => router.push('/admin/tutors')} className="text-xs text-blue-600 mb-4">
        ← Kembali ke Data Tentor
      </button>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{tutor.name}</h1>
            <p className="text-sm text-gray-500">{tutor.user.email}</p>
            {tutor.phone && <p className="text-sm text-gray-500">{tutor.phone}</p>}
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              tutor.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {tutor.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Sesi Selesai</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{totalCompleted}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Estimasi Honor</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{formatRupiah(totalHonor)}</p>
        </div>
      </div>

      <h2 className="text-sm font-medium text-gray-900 mb-3">Jadwal Mengajar</h2>
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Hari/Jam</th>
              <th className="px-4 py-3 font-medium">Jenis</th>
              <th className="px-4 py-3 font-medium">Kelas/Siswa</th>
              <th className="px-4 py-3 font-medium">Mapel</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {schedules.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  Belum ada jadwal.
                </td>
              </tr>
            ) : (
              schedules.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-600">
                    {DAY_NAMES[s.dayOfWeek]}, {formatTime(s.startTime)}–{formatTime(s.endTime)}
                  </td>
                  <td className="px-4 py-3"><TypeBadge type={s.sessionType} /></td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.sessionType === 'REGULAR' ? s.class?.name : s.student?.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.subject?.name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      {s.status === 'ACTIVE' ? 'Aktif' : s.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-medium text-gray-900 mb-3">Histori Mengajar</h2>
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Tanggal</th>
              <th className="px-4 py-3 font-medium">Jenis</th>
              <th className="px-4 py-3 font-medium">Kelas/Siswa</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Honor</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  Belum ada histori mengajar.
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-600">{formatDate(s.sessionDate)}</td>
                  <td className="px-4 py-3"><TypeBadge type={s.sessionType} /></td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.sessionType === 'REGULAR' ? s.class?.name : s.student?.name}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {s.status === 'COMPLETED' ? formatRupiah(s.honorRateSnapshot) : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
