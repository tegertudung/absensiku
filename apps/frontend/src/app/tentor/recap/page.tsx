'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { formatRupiah, formatDate } from '@/lib/format';
import { StatusBadge, TypeBadge } from '@/components/StatusBadge';
import { IconClock, IconChevronRight, IconCheckCircle, IconSchedule } from '@/components/icons';

interface SessionRow {
  id: string;
  sessionDate: string;
  sessionType: string;
  status: string;
  honorRateSnapshot: string | null;
  class: { name: string } | null;
  student: { name: string } | null;
  subject: { name: string } | null;
  startTime?: string | null;
  endTime?: string | null;
}

export default function TentorRecapPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingSlip, setDownloadingSlip] = useState(false);
  const exporting = downloadingSlip;
  const [filters, setFilters] = useState({ startDate: '', endDate: '', sessionType: '' });
  const [slipPeriod, setSlipPeriod] = useState({ month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) });
  const [slipMessage, setSlipMessage] = useState('');

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

  // Kept only while the legacy control is present in an existing layout branch.
  // Tentor export is intentionally disabled; Slip Honor is the download action.
  function handleExport() { return; }

  useEffect(() => {
    load();
  }, [load]);

  async function downloadSlip() {
    setDownloadingSlip(true);
    setSlipMessage('');
    try {
      const res = await api.get('/honor/slip.pdf', { params: { month: Number(slipPeriod.month), year: Number(slipPeriod.year) }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a'); link.href = url; link.download = 'slip-honor.pdf'; link.click(); URL.revokeObjectURL(url);
    } catch (err: any) { setSlipMessage(err.response?.data?.message || 'Gagal membuat Slip Honor.'); } finally { setDownloadingSlip(false); }
  }

  const totalHonor = sessions
    .filter((s) => s.status === 'COMPLETED')
    .reduce((sum, s) => sum + Number(s.honorRateSnapshot || 0), 0);
  const totalCompleted = sessions.filter((s) => s.status === 'COMPLETED').length;
  const totalMinutes = sessions.filter((s) => s.status === 'COMPLETED' && s.startTime && s.endTime).reduce((sum, s) => sum + Math.max(0, (new Date(s.endTime!).getTime() - new Date(s.startTime!).getTime()) / 60000), 0);
  const duration = totalMinutes ? `${Math.floor(totalMinutes / 60)} jam${totalMinutes % 60 ? ` ${totalMinutes % 60} menit` : ''}` : '0 jam';
  const monthLabel = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(Number(slipPeriod.year), Number(slipPeriod.month) - 1, 1));

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-navy-900">Rekap Mengajar</h1>
      <section className="rounded-2xl bg-gradient-to-br from-navy-950 to-navy-800 p-5 text-white shadow-sm"><p className="text-sm text-navy-200">Estimasi Honor</p><p className="mt-2 text-4xl font-bold tracking-tight">{formatRupiah(totalHonor)}</p><div className="mt-5 grid grid-cols-2 border-t border-white/20 pt-4"><div className="flex gap-2"><IconCheckCircle className="h-6 w-6 text-navy-100" /><div><p className="text-xl font-semibold">{totalCompleted}</p><p className="text-xs text-navy-200">Sesi Selesai</p></div></div><div className="flex gap-2 border-l border-white/20 pl-4"><IconClock className="h-6 w-6 text-navy-100" /><div><p className="text-lg font-semibold">{duration}</p><p className="text-xs text-navy-200">Jam Mengajar</p></div></div></div></section>

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

      <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2"><p className="text-sm font-medium text-gray-900">Slip Honor Tentor</p><div className="grid grid-cols-2 gap-2"><select value={slipPeriod.month} onChange={e=>setSlipPeriod({...slipPeriod,month:e.target.value})} className="rounded-md border border-gray-300 px-2 py-1.5 text-xs">{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{new Intl.DateTimeFormat('id-ID',{month:'long'}).format(new Date(2026,i,1))}</option>)}</select><input type="number" min="2000" value={slipPeriod.year} onChange={e=>setSlipPeriod({...slipPeriod,year:e.target.value})} className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"/></div><button onClick={downloadSlip} disabled={exporting} className="w-full text-xs font-medium text-white bg-navy-900 rounded-md py-2 disabled:opacity-60">Unduh Slip Honor</button>{slipMessage&&<p className="text-xs text-red-600">{slipMessage}</p>}</div>

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
                  <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-1">
                    <TypeBadge type={s.sessionType} />
                    {formatDate(s.sessionDate)} &middot; {s.subject?.name}
                  </p>
                </div>
                <StatusBadge status={s.status} />
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
