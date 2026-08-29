'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { TypeBadge } from '@/components/StatusBadge';

type Session = { id: string; sessionType: 'REGULAR' | 'PRIVATE'; status: string; material?: string | null; teachingNotes?: string | null; progressNotes?: string | null; score?: string | number | null; class?: { name: string; quotaRemaining: number; quotaTotal: number } | null; student?: { name: string; packages?: Array<{ quotaRemaining: number; quotaTotal: number }> } | null; subject?: { name: string } | null; schedule?: { startTime: string } | null };

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
  async function complete() { const validation = validate(); if (validation) return setError(validation); setError(null); setSaving(true); try { await api.post(`/sessions/${id}/complete`, payload()); setMessage('Sesi berhasil diselesaikan.'); await load(); } catch (err: any) { setError(err.response?.data?.message || 'Gagal menyelesaikan sesi.'); } finally { setSaving(false); } }

  if (!session) return <p className="text-sm text-gray-400">Memuat sesi...</p>;
  return <div className="mx-auto max-w-xl space-y-4 pb-8"><button onClick={() => router.push('/tentor/schedule')} className="text-xs font-medium text-navy-700">← Kembali ke Jadwal</button><section className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Detail Sesi</p><div className="mt-3 flex items-center justify-between"><div><p className="font-semibold text-gray-900">{privateSession ? session.student?.name : session.class?.name}</p><p className="mt-1 text-xs text-gray-500">{session.subject?.name || 'Mata pelajaran belum diatur'}</p></div><TypeBadge type={session.sessionType} /></div>{quota && <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${noQuota ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-gray-700'}`}>{noQuota ? (privateSession ? 'Paket Pertemuan Habis — Hubungi Admin.' : 'Pertemuan Kelas Habis — Hubungi Admin.') : <>Sisa Pertemuan: <strong>{quota.quotaRemaining} / {quota.quotaTotal}</strong></>}</p>}</section><section className="rounded-xl border border-gray-200 bg-white p-4"><h1 className="text-base font-semibold text-gray-900">{privateSession ? 'Catatan Belajar Privat' : 'Catatan Mengajar'}</h1><div className="mt-4 space-y-4"><label className="block text-sm font-medium text-gray-700">Materi Hari Ini <span className="text-red-600">*</span><textarea value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} disabled={isFinished || saving || noQuota} rows={3} className="mt-1.5 w-full rounded-lg border border-gray-300 p-3 text-sm" /></label>{privateSession ? <><label className="block text-sm font-medium text-gray-700">Catatan Perkembangan <span className="text-red-600">*</span><textarea value={form.progressNotes} onChange={(e) => setForm({ ...form, progressNotes: e.target.value })} disabled={isFinished || saving || noQuota} rows={4} className="mt-1.5 w-full rounded-lg border border-gray-300 p-3 text-sm" /></label><label className="block text-sm font-medium text-gray-700">Nilai <span className="font-normal text-gray-400">(opsional)</span><input type="number" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} disabled={isFinished || saving || noQuota} className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm" /></label></> : <label className="block text-sm font-medium text-gray-700">Catatan Mengajar <span className="font-normal text-gray-400">(opsional)</span><textarea value={form.teachingNotes} onChange={(e) => setForm({ ...form, teachingNotes: e.target.value })} disabled={isFinished || saving || noQuota} rows={4} className="mt-1.5 w-full rounded-lg border border-gray-300 p-3 text-sm" /></label>}</div>{error && <p className="mt-3 text-sm text-red-700">{error}</p>}{message && <p className="mt-3 text-sm text-green-700">{message}</p>} {!isFinished && <div className="mt-5 flex gap-2"><button onClick={save} disabled={saving || noQuota} className="flex-1 rounded-lg border border-navy-300 py-2.5 text-sm font-medium text-navy-800 disabled:opacity-50">Simpan</button><button onClick={complete} disabled={saving || noQuota} className="flex-1 rounded-lg bg-navy-900 py-2.5 text-sm font-medium text-white disabled:opacity-50">Selesaikan Sesi</button></div>}</section></div>;
}
