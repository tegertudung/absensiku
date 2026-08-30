'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { TypeBadge } from '@/components/StatusBadge';
import { IconCheckCircle, IconChevronLeft, IconClock, IconMapPin, IconVideo } from '@/components/icons';

type Session = { id: string; sessionType: 'REGULAR' | 'PRIVATE'; status: string; sessionDate?: string; startTime?: string | null; endTime?: string | null; mode?: string; location?: string | null; material?: string | null; teachingNotes?: string | null; progressNotes?: string | null; score?: string | number | null; class?: { name: string; quotaRemaining: number; quotaTotal: number } | null; student?: { name: string; packages?: Array<{ quotaRemaining: number; quotaTotal: number }> } | null; subject?: { name: string } | null; schedule?: { startTime: string; endTime?: string; mode?: string; location?: string | null } | null };

export default function TutorSessionEntryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [form, setForm] = useState({ material: '', teachingNotes: '', progressNotes: '', score: '' });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get('/sessions');
    const item = res.data.data.find((entry: Session) => entry.id === id) ?? null;
    setSession(item);
    if (item) setForm({ material: item.material || '', teachingNotes: item.teachingNotes || '', progressNotes: item.progressNotes || '', score: item.score?.toString() || '' });
  }, [id]);
  useEffect(() => { load().catch(() => setError('Gagal memuat detail sesi.')); }, [load]);

  const privateSession = session?.sessionType === 'PRIVATE';
  const quota = privateSession ? session?.student?.packages?.[0] : session?.class;
  const isFinished = session?.status === 'COMPLETED';
  const noQuota = quota?.quotaRemaining === 0;
  function payload() { return { material: form.material, teachingNotes: form.teachingNotes || undefined, progressNotes: form.progressNotes || undefined, score: form.score === '' ? null : Number(form.score) }; }
  function validate() {
    if (!form.material.trim()) return 'Materi hari ini wajib diisi.';
    if (privateSession && !form.progressNotes.trim()) return 'Catatan perkembangan wajib diisi untuk sesi privat.';
    if (form.score !== '' && Number.isNaN(Number(form.score))) return 'Nilai harus berupa angka yang valid.';
    return null;
  }
  async function save() { setError(null); setMessage(null); setSaving(true); try { await api.patch(`/sessions/${id}/draft`, payload()); setMessage('Data sesi sudah diisi.'); await load(); } catch (err: any) { setError(err.response?.data?.message || 'Gagal menyimpan data sesi.'); } finally { setSaving(false); } }
  // Redirects straight back to Jadwal on success — per revisi, there's no
  // reason to linger on a now-read-only, already-completed form.
  async function complete() { const validation = validate(); if (validation) return setError(validation); setError(null); setSaving(true); try { await api.post(`/sessions/${id}/complete`, payload()); router.push('/tentor/schedule'); } catch (err: any) { setError(err.response?.data?.message || 'Gagal menyelesaikan sesi.'); setSaving(false); } }

  if (!session) return <p className="text-sm text-gray-400">Memuat sesi...</p>;
  if (isFinished || session.status === 'CANCELLED_NOT_COUNTED' || session.status === 'CANCELLED') return <CompletedDetail session={session} onBack={() => router.back()} />;
  return <div className="mx-auto max-w-xl space-y-4 pb-8"><button onClick={() => router.push('/tentor/schedule')} className="text-xs font-medium text-navy-700">← Kembali ke Jadwal</button><section className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Detail Sesi</p><div className="mt-3 flex items-center justify-between"><div><p className="font-semibold text-gray-900">{privateSession ? session.student?.name : session.class?.name}</p><p className="mt-1 text-xs text-gray-500">{session.subject?.name || 'Mata pelajaran belum diatur'}</p></div><TypeBadge type={session.sessionType} /></div>{quota && <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${noQuota ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-gray-700'}`}>{noQuota ? (privateSession ? 'Paket Pertemuan Habis — Hubungi Admin.' : 'Pertemuan Kelas Habis — Hubungi Admin.') : <>Sisa Pertemuan: <strong>{quota.quotaRemaining} / {quota.quotaTotal}</strong></>}</p>}</section><section className="rounded-xl border border-gray-200 bg-white p-4"><h1 className="text-base font-semibold text-gray-900">{privateSession ? 'Catatan Belajar Privat' : 'Catatan Mengajar'}</h1><div className="mt-4 space-y-4"><label className="block text-sm font-medium text-gray-700">Materi Hari Ini <span className="text-red-600">*</span><textarea value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} disabled={isFinished || saving || noQuota} rows={3} className="mt-1.5 w-full rounded-lg border border-gray-300 p-3 text-sm" /></label>{privateSession ? <><label className="block text-sm font-medium text-gray-700">Catatan Perkembangan <span className="text-red-600">*</span><textarea value={form.progressNotes} onChange={(e) => setForm({ ...form, progressNotes: e.target.value })} disabled={isFinished || saving || noQuota} rows={4} className="mt-1.5 w-full rounded-lg border border-gray-300 p-3 text-sm" /></label><label className="block text-sm font-medium text-gray-700">Nilai <span className="font-normal text-gray-400">(opsional)</span><input type="number" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} disabled={isFinished || saving || noQuota} className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm" /></label></> : <label className="block text-sm font-medium text-gray-700">Catatan Mengajar <span className="font-normal text-gray-400">(opsional)</span><textarea value={form.teachingNotes} onChange={(e) => setForm({ ...form, teachingNotes: e.target.value })} disabled={isFinished || saving || noQuota} rows={4} className="mt-1.5 w-full rounded-lg border border-gray-300 p-3 text-sm" /></label>}</div>{error && <p className="mt-3 text-sm text-red-700">{error}</p>}{message && <p className="mt-3 text-sm text-green-700">{message}</p>} {!isFinished && <div className="mt-5 flex gap-2"><button onClick={save} disabled={saving || noQuota} className="flex-1 rounded-lg border border-navy-300 py-2.5 text-sm font-medium text-navy-800 disabled:opacity-50">Simpan</button><button onClick={complete} disabled={saving || noQuota} className="flex-1 rounded-lg bg-navy-900 py-2.5 text-sm font-medium text-white disabled:opacity-50">Selesaikan Sesi</button></div>}</section></div>;
}

function CompletedDetail({ session, onBack }: { session: Session; onBack: () => void }) {
  const privateSession = session.sessionType === 'PRIVATE'; const start = session.startTime || session.schedule?.startTime; const end = session.endTime || session.schedule?.endTime;
  const time = (v?: string | null) => v ? new Date(v).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : null;
  const minutes = start && end ? Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)) : 0;
  const duration = minutes ? `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} jam ` : ''}${minutes % 60} menit` : null;
  const cancelled = session.status !== 'COMPLETED'; const mode = session.mode || session.schedule?.mode;
  const rows = [['Jenis Sesi', privateSession ? 'Privat' : 'Reguler'], [privateSession ? 'Siswa' : 'Kelas', privateSession ? session.student?.name : session.class?.name], ['Mode Belajar', mode === 'ONLINE' ? 'Online' : mode ? 'Offline' : null], ['Tanggal', session.sessionDate ? new Date(session.sessionDate).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : null], ['Jam Mulai', time(start)], ['Jam Selesai', time(end)], ['Durasi', duration], ['Lokasi', session.location || session.schedule?.location]].filter((r) => r[1]);
  return <div className="mx-auto max-w-md pb-8"><button onClick={onBack} className="flex min-h-11 items-center gap-1 text-sm font-medium text-navy-800"><IconChevronLeft className="h-5 w-5" />Kembali</button><h1 className="mb-5 mt-2 text-[22px] font-bold text-navy-900">Detail Sesi Mengajar</h1><section className={`rounded-2xl p-5 text-white shadow-sm ${cancelled ? 'bg-red-700' : 'bg-navy-900'}`}><div className="flex items-center gap-2 text-xs font-semibold"><span className={`flex h-6 w-6 items-center justify-center rounded-full ${cancelled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}><IconCheckCircle className="h-4 w-4" /></span>{cancelled ? 'Dibatalkan' : 'Selesai'}</div><h2 className="mt-5 text-xl font-bold">{session.subject?.name || 'Sesi Mengajar'}</h2><p className="mt-1 text-sm text-white/75">{privateSession ? session.student?.name : session.class?.name}</p>{start && <p className="mt-5 flex items-center gap-2 text-sm"><IconClock className="h-4 w-4" />{time(start)}{end ? ` – ${time(end)}` : ''}{duration ? ` · ${duration}` : ''}</p>}</section><section className="mt-5 rounded-2xl border border-gray-200 bg-white p-4"><h2 className="text-sm font-semibold text-navy-900">Informasi Sesi</h2><div className="mt-2 divide-y divide-gray-100">{rows.map(([k,v])=><div key={String(k)} className="flex justify-between gap-4 py-3 text-sm"><span className="text-gray-500">{k}</span><span className="text-right font-medium text-navy-900">{v}</span></div>)}</div></section>{session.material && <ReadSection title="Materi Hari Ini" value={session.material} />}{privateSession && session.progressNotes && <ReadSection title="Catatan Perkembangan" value={session.progressNotes} />}{session.score != null && <ReadSection title="Nilai" value={String(session.score)} compact />}</div>;
}
function ReadSection({ title, value, compact }: { title: string; value: string; compact?: boolean }) { return <section className="mt-5"><h2 className="mb-2 text-sm font-semibold text-navy-900">{title}</h2><div className={`rounded-2xl border border-gray-200 bg-white p-4 text-sm leading-6 text-gray-700 whitespace-pre-wrap ${compact ? 'font-semibold text-navy-900' : ''}`}>{value}</div></section>; }
