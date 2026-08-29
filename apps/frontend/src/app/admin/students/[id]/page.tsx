'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { formatRupiah, formatDate } from '@/lib/format';
import { StatusBadge, TypeBadge } from '@/components/StatusBadge';

interface StudentDetail {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  status: string;
  packages: Array<{ id: string; packageName: string | null; quotaTotal: number; quotaRemaining: number; status: string }>;
  enrollments: Array<{ class: { name: string; level: string | null; quotaTotal: number; quotaRemaining: number } }>;
}

interface ClassEnrollmentRow {
  id: string;
  class: { name: string; level: string | null; quotaTotal: number; quotaRemaining: number };
}

interface SessionRow {
  id: string;
  sessionDate: string;
  sessionType: string;
  status: string;
  honorRateSnapshot: string | null;
  class: { name: string } | null;
  tutor: { name: string };
  subject: { name: string } | null;
}

const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Aktif', INACTIVE: 'Nonaktif', GRADUATED: 'Lulus' };

export default function AdminStudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.id as string;

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [classes, setClasses] = useState<ClassEnrollmentRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [studentRes, classesRes, sessionsRes] = await Promise.all([
        api.get(`/students/${studentId}`),
        api.get(`/students/${studentId}/classes`),
        api.get('/sessions', { params: { studentId } }),
      ]);
      setStudent(studentRes.data.data);
      setClasses(classesRes.data.data);
      setSessions(sessionsRes.data.data);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const totalCompleted = sessions.filter((s) => s.status === 'COMPLETED').length;
  const activePackages = student?.packages.filter((pkg) => pkg.status === 'ACTIVE') ?? [];

  if (loading) return <p className="text-sm text-gray-400">Memuat...</p>;
  if (!student) return <p className="text-sm text-red-500">Siswa tidak ditemukan.</p>;

  return (
    <div>
      <button onClick={() => router.push('/admin/students')} className="text-xs text-blue-600 mb-4">
        ← Kembali ke Data Siswa
      </button>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{student.name}</h1>
            {student.phone && <p className="text-sm text-gray-500">{student.phone}</p>}
            {student.guardianName && (
              <p className="text-sm text-gray-500">
                Wali: {student.guardianName} {student.guardianPhone ? `(${student.guardianPhone})` : ''}
              </p>
            )}
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              student.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {STATUS_LABELS[student.status] ?? student.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Kelas Reguler Diikuti</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{classes.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Sesi Selesai</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{totalCompleted}</p>
        </div>
      </div>

      <h2 className="text-sm font-medium text-gray-900 mb-3">Program & Sisa Sesi</h2>
      <div className="mb-6 space-y-2 rounded-lg border border-gray-200 bg-white p-4">
        {student.enrollments.length === 0 && activePackages.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada program belajar.</p>
        ) : (
          <>
            {student.enrollments.map((enrollment) => <div key={`regular-${enrollment.class.name}`} className="flex items-center justify-between rounded-md bg-blue-50 px-3 py-2 text-sm"><span><span className="mr-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">Reguler</span>{enrollment.class.name}</span><strong className="text-blue-900">{enrollment.class.quotaRemaining} / {enrollment.class.quotaTotal}</strong></div>)}
            {activePackages.map((pkg) => <div key={`private-${pkg.id}`} className="flex items-center justify-between rounded-md bg-navy-50 px-3 py-2 text-sm"><span><span className="mr-2 rounded-full bg-navy-100 px-2 py-0.5 text-xs font-medium text-navy-800">Privat</span>{pkg.packageName || 'Paket Privat'}</span><strong className="text-navy-900">{pkg.quotaRemaining} / {pkg.quotaTotal}</strong></div>)}
          </>
        )}
      </div>

      <h2 className="text-sm font-medium text-gray-900 mb-3">Kelas Reguler</h2>
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Nama Kelas</th>
              <th className="px-4 py-3 font-medium">Jenjang</th>
              <th className="px-4 py-3 font-medium">Sisa Sesi</th>
            </tr>
          </thead>
          <tbody>
            {classes.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  Belum terdaftar di kelas reguler manapun.
                </td>
              </tr>
            ) : (
              classes.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-900">{c.class.name}</td>
                  <td className="px-4 py-3 text-gray-600">{c.class.level || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{c.class.quotaRemaining} / {c.class.quotaTotal}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-medium text-gray-900 mb-3">Histori Sesi</h2>
      <p className="text-xs text-gray-500 mb-2">
        Menampilkan sesi privat (tercatat langsung ke siswa). Sesi reguler tercatat per kelas — lihat halaman
        Rekap dengan filter Kelas untuk kehadiran di kelas reguler.
      </p>
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Tanggal</th>
              <th className="px-4 py-3 font-medium">Tentor</th>
              <th className="px-4 py-3 font-medium">Jenis</th>
              <th className="px-4 py-3 font-medium">Mapel</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Honor</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Belum ada histori sesi.
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-600">{formatDate(s.sessionDate)}</td>
                  <td className="px-4 py-3 text-gray-900">{s.tutor.name}</td>
                  <td className="px-4 py-3"><TypeBadge type={s.sessionType} /></td>
                  <td className="px-4 py-3 text-gray-600">{s.subject?.name || '-'}</td>
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
