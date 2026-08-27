'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatRupiah, formatDate, SESSION_STATUS_LABELS, SESSION_TYPE_LABELS } from '@/lib/format';

interface SessionRow {
  id: string;
  sessionDate: string;
  sessionType: string;
  status: string;
  honorRateSnapshot: string | null;
  tutor: { name: string };
  class: { name: string } | null;
  student: { name: string } | null;
  subject: { name: string } | null;
}

interface Option {
  id: string;
  name: string;
}

export default function AdminRecapPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [tutors, setTutors] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    tutorId: '',
    sessionType: '',
    status: '',
  });

  function buildParams() {
    const params: Record<string, string> = {};
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
    if (filters.tutorId) params.tutorId = filters.tutorId;
    if (filters.sessionType) params.sessionType = filters.sessionType;
    if (filters.status) params.status = filters.status;
    return params;
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/sessions', { params: buildParams() });
      setSessions(res.data.data);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    api.get('/tutors').then((res) => setTutors(res.data.data.map((t: any) => ({ id: t.id, name: t.name }))));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get('/export/recap.xlsx', { params: buildParams(), responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `rekap-mengajar-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const totalHonor = sessions
    .filter((s) => s.status === 'COMPLETED')
    .reduce((sum, s) => sum + Number(s.honorRateSnapshot || 0), 0);
  const totalCompleted = sessions.filter((s) => s.status === 'COMPLETED').length;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Rekap Mengajar & Honor</h1>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-md bg-green-600 text-white text-sm font-medium px-4 py-2 hover:bg-green-700 disabled:opacity-60"
        >
          {exporting ? 'Mengekspor...' : '⬇ Export Excel'}
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Dari Tanggal</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Sampai Tanggal</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tentor</label>
          <select
            value={filters.tutorId}
            onChange={(e) => setFilters({ ...filters, tutorId: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Semua Tentor</option>
            {tutors.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Jenis</label>
          <select
            value={filters.sessionType}
            onChange={(e) => setFilters({ ...filters, sessionType: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Semua</option>
            <option value="REGULAR">Reguler</option>
            <option value="PRIVATE">Privat</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Semua</option>
            {Object.entries(SESSION_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Sesi Selesai</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{totalCompleted}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Estimasi Honor</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{formatRupiah(totalHonor)}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Tanggal</th>
              <th className="px-4 py-3 font-medium">Tentor</th>
              <th className="px-4 py-3 font-medium">Jenis</th>
              <th className="px-4 py-3 font-medium">Kelas/Siswa</th>
              <th className="px-4 py-3 font-medium">Mapel</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Honor</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  Memuat...
                </td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  Tidak ada data untuk filter ini.
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-600">{formatDate(s.sessionDate)}</td>
                  <td className="px-4 py-3 text-gray-900">{s.tutor.name}</td>
                  <td className="px-4 py-3 text-gray-600">{SESSION_TYPE_LABELS[s.sessionType]}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.sessionType === 'REGULAR' ? s.class?.name : s.student?.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.subject?.name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {SESSION_STATUS_LABELS[s.status] ?? s.status}
                    </span>
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
