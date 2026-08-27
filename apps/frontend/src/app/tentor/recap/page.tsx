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
  class: { name: string } | null;
  student: { name: string } | null;
  subject: { name: string } | null;
}

export default function TentorRecapPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({ startDate: '', endDate: '', sessionType: '' });

  function buildParams() {
    const params: Record<string, string> = {};
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
    if (filters.sessionType) params.sessionType = filters.sessionType;
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
    load();
  }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get('/export/recap.xlsx', { params: buildParams(), responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `rekap-mengajar-saya-${new Date().toISOString().split('T')[0]}.xlsx`;
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Total Sesi</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{totalCompleted}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Estimasi Honor</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{formatRupiah(totalHonor)}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
          />
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
          />
        </div>
        <select
          value={filters.sessionType}
          onChange={(e) => setFilters({ ...filters, sessionType: e.target.value })}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
        >
          <option value="">Semua Jenis</option>
          <option value="REGULAR">Reguler</option>
          <option value="PRIVATE">Privat</option>
        </select>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full text-xs font-medium text-white bg-green-600 rounded-md py-2 disabled:opacity-60"
        >
          {exporting ? 'Mengekspor...' : '⬇ Export Rekap Saya'}
        </button>
      </div>

      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-400">Tidak ada data untuk filter ini.</p>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {s.sessionType === 'REGULAR' ? s.class?.name : s.student?.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(s.sessionDate)} &middot; {SESSION_TYPE_LABELS[s.sessionType]} &middot;{' '}
                    {s.subject?.name}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
                  {SESSION_STATUS_LABELS[s.status] ?? s.status}
                </span>
              </div>
              {s.status === 'COMPLETED' && (
                <p className="text-sm font-medium text-gray-900 mt-2">
                  {formatRupiah(s.honorRateSnapshot)}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
