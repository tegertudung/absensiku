'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { formatRupiah, formatDate, SESSION_STATUS_LABELS } from '@/lib/format';
import { StatusBadge, TypeBadge } from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { IconCheckCircle, IconClasses, IconPrivate, IconReport } from '@/components/icons';

interface SessionRow {
  id: string;
  tutorId: string;
  sessionDate: string;
  sessionType: string;
  status: string;
  honorRateSnapshot: string | null;
  tutor: { name: string };
  class: { name: string } | null;
  student: { name: string } | null;
  subject: { name: string } | null;
  schedule: { startTime: string } | null;
}

function formatHariJam(session: SessionRow): string {
  const hari = DAY_NAMES[new Date(session.sessionDate).getUTCDay()];
  if (!session.schedule?.startTime) return hari;
  const t = new Date(session.schedule.startTime);
  const jam = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  return `${hari}, ${jam}`;
}

interface Option {
  id: string;
  name: string;
  status?: string;
  title?: string | null;
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];

export default function AdminRecapPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [tutors, setTutors] = useState<Option[]>([]);
  const [classes, setClasses] = useState<Option[]>([]);
  const [programs, setPrograms] = useState<Array<{ id: string; code: string; name: string; isActive: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [slipPeriod, setSlipPeriod] = useState({ month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) });
  const [slip, setSlip] = useState<any | null>(null);
  const [slipMessage, setSlipMessage] = useState('');
  const [showSlipModal, setShowSlipModal] = useState(false);

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    tutorId: '',
    sessionType: '',
    status: '',
    classId: '',
    dayOfWeek: '',
    hour: '',
  });

  function buildParams() {
    const params: Record<string, string> = {};
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
    if (filters.tutorId) params.tutorId = filters.tutorId;
    if (filters.sessionType) params.sessionType = filters.sessionType;
    if (filters.status) params.status = filters.status;
    if (filters.classId) params.classId = filters.classId;
    if (filters.dayOfWeek) params.dayOfWeek = filters.dayOfWeek;
    if (filters.hour) params.hour = filters.hour;
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
    api.get('/tutors').then((res) => setTutors(res.data.data.map((t: any) => ({ id: t.id, name: t.name, status: t.status, title: t.title }))));
    api.get('/classes').then((res) => setClasses(res.data.data.map((c: any) => ({ id: c.id, name: c.name }))));
    api.get('/programs').then((res) => setPrograms(res.data.data));
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
    } catch {
      alert('Gagal mengekspor rekap Excel.');
    } finally {
      setExporting(false);
    }
  }

  function openSlipModal() {
    const start = filters.startDate ? new Date(`${filters.startDate}T00:00:00`) : null;
    const end = filters.endDate ? new Date(`${filters.endDate}T00:00:00`) : null;
    if (start && end && start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
      setSlipPeriod({ month: String(start.getMonth() + 1), year: String(start.getFullYear()) });
    }
    setSlip(null); setSlipMessage(''); setShowSlipModal(true);
  }
  function previewSlip() { if (!filters.tutorId) return setSlipMessage('Pilih satu Tentor untuk membuat Slip Honor.'); router.push(`/admin/recap/slip/${filters.tutorId}?month=${slipPeriod.month}&year=${slipPeriod.year}`); }

  async function loadSlipSummary() {
    if (!filters.tutorId) return setSlipMessage('Pilih satu Tentor untuk Slip Honor.');
    setSlipMessage(''); setSlip(null);
    try { const res = await api.get('/honor/slip-summary', { params: { tutorId: filters.tutorId, month: Number(slipPeriod.month), year: Number(slipPeriod.year) } }); setSlip(res.data.data); }
    catch (err: any) { setSlipMessage(err.response?.data?.message || 'Gagal memuat data honor.'); }
  }

  const totalHonor = sessions
    .filter((s) => s.status === 'COMPLETED')
    .reduce((sum, s) => sum + Number(s.honorRateSnapshot || 0), 0);
  const totalCompleted = sessions.filter((s) => s.status === 'COMPLETED').length;
  const completedByProgram = sessions.filter((s) => s.status === 'COMPLETED').reduce<Record<string, number>>((acc, s) => { const name = programs.find((p) => p.code === s.sessionType)?.name || (s.sessionType === 'REGULAR' ? 'Reguler' : 'Privat'); acc[name] = (acc[name] || 0) + Number(s.honorRateSnapshot || 0); return acc; }, {});
  const completedSessionsByProgram = sessions.filter((s) => s.status === 'COMPLETED').reduce<Record<string, number>>((acc, s) => { const name = programs.find((p) => p.code === s.sessionType)?.name || (s.sessionType === 'REGULAR' ? 'Reguler' : 'Privat'); acc[name] = (acc[name] || 0) + 1; return acc; }, {});
  const activeTutorCount = tutors.filter((t) => t.status === 'ACTIVE').length;
  const resetFilters = () => setFilters({ startDate: '', endDate: '', tutorId: '', sessionType: '', status: '', classId: '', dayOfWeek: '', hour: '' });

  return (
    <div>
      <div className="flex flex-wrap justify-between gap-3 items-center mb-4">
        <div><h1 className="text-xl font-semibold text-gray-900">Rekap Mengajar & Honor</h1><p className="mt-1 text-sm text-gray-500">Ringkasan aktivitas mengajar dan perhitungan honor tentor.</p></div>
        <div className="flex items-center gap-2"><button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-md border border-navy-900 bg-white text-navy-900 text-sm font-medium px-3 py-2 hover:bg-navy-50 disabled:opacity-60"
        >
          {exporting ? 'Mengekspor...' : '⬇ Export Excel'}
        </button>
        <button onClick={openSlipModal} className="rounded-md bg-navy-900 text-white text-sm font-medium px-3 py-2 hover:bg-navy-800">Unduh Slip Honor PDF</button></div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-navy-50 text-navy-900"><IconCheckCircle className="h-5 w-5" /></span><div><p className="text-xs text-gray-500">Total Sesi Selesai</p><p className="text-2xl font-semibold text-gray-900">{totalCompleted}<small className="ml-1 text-xs font-normal text-gray-500">sesi</small></p></div></div>
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-navy-50 text-navy-900"><IconClasses className="h-5 w-5" /></span><div><p className="text-xs text-gray-500">Program Aktif</p><p className="text-2xl font-semibold text-gray-900">{programs.filter((p) => p.isActive).length}<small className="ml-1 text-xs font-normal text-gray-500">program</small></p></div></div>
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-navy-50 text-navy-900"><IconPrivate className="h-5 w-5" /></span><div><p className="text-xs text-gray-500">Tentor Aktif</p><p className="text-2xl font-semibold text-gray-900">{activeTutorCount}<small className="ml-1 text-xs font-normal text-gray-500">tentor</small></p></div></div>
        <div className="flex items-center gap-3 rounded-lg border border-navy-800 bg-navy-900 p-4 text-white"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-white"><IconReport className="h-5 w-5" /></span><div><p className="text-xs text-navy-200">Total Estimasi Honor</p><p className="text-xl font-semibold">{formatRupiah(totalHonor)}</p></div></div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="font-medium text-gray-900">Filter Data</h2><p className="text-xs text-gray-500">Digunakan untuk tabel rekap dan Export Excel.</p></div><button onClick={resetFilters} className="text-sm font-medium text-navy-900 hover:underline">Reset Filter</button></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          <label className="block text-xs font-medium text-gray-700 mb-1">Program</label>
          <select
            value={filters.sessionType}
            onChange={(e) => setFilters({ ...filters, sessionType: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Semua Program</option>
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
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Kelas</label>
          <select
            value={filters.classId}
            onChange={(e) => setFilters({ ...filters, classId: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Semua Kelas</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Hari</label>
          <select
            value={filters.dayOfWeek}
            onChange={(e) => setFilters({ ...filters, dayOfWeek: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Semua Hari</option>
            {DAY_NAMES.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Jam</label>
          <input
            type="time"
            value={filters.hour}
            onChange={(e) => setFilters({ ...filters, hour: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Tanggal</th>
              <th className="px-4 py-3 font-medium">Tentor</th>
              <th className="px-4 py-3 font-medium">Program</th>
              <th className="px-4 py-3 font-medium">Kelas/Siswa</th>
              <th className="px-4 py-3 font-medium">Mapel</th>
              <th className="px-4 py-3 font-medium">Sesi / Jam</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Tarif Sesi</th>
              <th className="px-4 py-3 font-medium">Honor</th>
              <th className="px-4 py-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-gray-400">
                  Memuat...
                </td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-gray-400">
                  Belum ada data mengajar untuk filter ini.
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-700"><p>{formatDate(s.sessionDate)}</p><p className="text-xs text-gray-400">{DAY_NAMES[new Date(s.sessionDate).getUTCDay()]}</p></td>
                  <td className="px-4 py-3 text-gray-900"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-100 text-[10px] font-semibold text-navy-900">{s.tutor.name.slice(0,2).toUpperCase()}</span><span>{s.tutor.name}</span></div></td>
                  <td className="px-4 py-3"><TypeBadge type={s.sessionType} /></td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.sessionType === 'REGULAR' ? s.class?.name : s.student?.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.subject?.name || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatHariJam(s)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.status === 'COMPLETED' ? formatRupiah(s.honorRateSnapshot) : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {s.status === 'COMPLETED' ? formatRupiah(s.honorRateSnapshot) : '-'}
                  </td>
                  <td className="px-4 py-3">{s.status === 'COMPLETED' && <Link href={`/admin/recap/tutor/${s.tutorId || ''}?month=${slipPeriod.month}&year=${slipPeriod.year}`} className="text-xs font-medium text-navy-900 hover:underline">Lihat Detail</Link>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4"><div><h2 className="font-medium text-gray-900">Ringkasan Honor per Program</h2><p className="text-xs text-gray-500">Total honor berdasarkan filter data aktif (hanya sesi selesai).</p></div><div className="mt-3 grid gap-3 md:grid-cols-3">{programs.filter(p=>p.isActive).map(program=>{const total=completedByProgram[program.name]||0;const count=completedSessionsByProgram[program.name]||0;return <div key={program.id} className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-sm font-medium text-navy-900">{program.name}</p><p className="mt-2 text-xs text-gray-500">{count} sesi</p><p className="mt-1 text-lg font-semibold">{formatRupiah(total)}</p></div>})}<div className="rounded-lg bg-navy-900 p-4 text-white"><p className="text-sm font-medium">TOTAL</p><p className="mt-2 text-xs text-navy-200">{totalCompleted} sesi</p><p className="mt-1 text-lg font-semibold">{formatRupiah(totalHonor)}</p></div></div></section>

      {showSlipModal && <Modal title="Unduh Slip Honor Tentor" onClose={() => setShowSlipModal(false)} className="max-w-2xl">
        <p className="mb-3 text-sm text-gray-500">Slip ini menghitung seluruh sesi selesai Tentor pada bulan terpilih, terlepas dari filter Jenis, Kelas, Hari, atau Jam pada rekap.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">Tentor<select value={filters.tutorId} onChange={e=>setFilters({...filters,tutorId:e.target.value})} className="mt-1 w-full rounded border px-3 py-2"><option value="">Pilih Tentor</option>{tutors.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label className="text-sm">Bulan<select value={slipPeriod.month} onChange={e=>setSlipPeriod({...slipPeriod,month:e.target.value})} className="mt-1 w-full rounded border px-3 py-2">{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{new Intl.DateTimeFormat('id-ID',{month:'long'}).format(new Date(2026,i,1))}</option>)}</select></label>
          <label className="text-sm">Tahun<input type="number" min="2000" value={slipPeriod.year} onChange={e=>setSlipPeriod({...slipPeriod,year:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" /></label>
        </div>
        <div className="mt-3 flex justify-end gap-2"><button onClick={() => setShowSlipModal(false)} className="rounded border border-gray-300 px-3 py-2 text-sm">Batal</button><button onClick={loadSlipSummary} disabled={!filters.tutorId} className="rounded border border-navy-900 px-3 py-2 text-sm text-navy-900 disabled:opacity-60">Lihat Ringkasan</button><button onClick={previewSlip} disabled={!filters.tutorId||!slip} className="rounded bg-navy-900 px-3 py-2 text-sm text-white disabled:opacity-60">Preview Slip</button></div>
        {slipMessage&&<p className="mt-3 text-sm text-red-600">{slipMessage}</p>}
        {slip&&<div className="mt-4 rounded bg-slate-50 p-4"><p className="font-medium">{slip.tutor.name}{slip.tutor.title ? `, ${slip.tutor.title}` : ''}</p><p className="text-sm text-gray-600">{new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric'}).format(new Date(slip.year,slip.month-1,1))}</p><table className="mt-3 w-full text-sm"><thead><tr className="text-left text-gray-500"><th>Program</th><th>Sesi</th><th>Honor/Sesi</th><th>Subtotal</th></tr></thead><tbody>{slip.rows.map((r:any,i:number)=><tr key={i}><td className="py-1">{r.program}</td><td>{r.sessions}</td><td>{formatRupiah(r.rate)}</td><td>{formatRupiah(r.subtotal)}</td></tr>)}</tbody></table><p className="mt-2 font-medium">Total Sesi: {slip.totalSessions} · {formatRupiah(slip.totalHonor)}</p></div>}
      </Modal>}
    </div>
  );
}
