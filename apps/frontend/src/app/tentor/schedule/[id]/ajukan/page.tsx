'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { IconChevronLeft, IconWarning } from '@/components/icons';

interface ScheduleDetail {
  id: string;
  sessionType: 'REGULAR' | 'PRIVATE';
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  class?: { name: string } | null;
  student?: { name: string } | null;
  subject?: { name: string } | null;
}

interface ConflictRow {
  scheduleId: string;
  label: string;
  startTime: string;
  endTime: string;
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayISODate() {
  return new Date().toISOString().split('T')[0];
}

export default function AjukanPerubahanJadwalPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({ date: todayISODate(), startTime: '16:00', endTime: '17:30', reason: '' });
  const [dayOfWeek, setDayOfWeek] = useState(new Date().getDay());
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/schedules/${id}`);
      setSchedule(res.data.data);
    } catch {
      setError('Jadwal tidak ditemukan atau bukan milik Anda.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setDayOfWeek(new Date(`${form.date}T00:00:00`).getDay());
  }, [form.date]);

  useEffect(() => {
    if (!form.date || !form.startTime || !form.endTime || form.startTime >= form.endTime) {
      setConflicts([]);
      return;
    }
    const handle = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await api.post('/schedules/check-conflicts', {
          dayOfWeek,
          startDate: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
        });
        setConflicts(res.data.data.filter((c: ConflictRow) => c.scheduleId !== id));
      } catch {
        // pre-check is a convenience, not a blocking validation
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [dayOfWeek, form.date, form.startTime, form.endTime, id]);

  async function handleSubmit() {
    setError(null);
    if (form.reason.trim().length < 3) return setError('Alasan perubahan wajib diisi (minimal 3 karakter).');
    if (form.startTime >= form.endTime) return setError('Jam mulai harus sebelum jam selesai.');

    setSubmitting(true);
    try {
      await api.put(`/schedules/${id}`, {
        dayOfWeek,
        startDate: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        reason: form.reason.trim(),
      });
      router.push('/tentor/schedule');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Gagal mengajukan perubahan jadwal.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Memuat...</p>;
  if (!schedule) return <p className="text-sm text-red-600">{error || 'Jadwal tidak ditemukan.'}</p>;

  const label = schedule.sessionType === 'REGULAR' ? schedule.class?.name : schedule.student?.name;

  return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500">
        <IconChevronLeft className="w-4 h-4" />
        Kembali
      </button>

      <h1 className="text-lg font-semibold text-gray-900">Ajukan Perubahan Jadwal</h1>

      {/* Old schedule, struck through — mirrors the mockup's "before" card */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="font-medium text-gray-900">{label}</p>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
            {schedule.sessionType === 'REGULAR' ? 'Reguler' : 'Privat'}
          </span>
        </div>
        {schedule.subject?.name && <p className="mt-1 text-xs text-gray-500">{schedule.subject.name}</p>}
        <p className="mt-2 text-sm text-gray-400 line-through">
          {DAY_NAMES[schedule.dayOfWeek]}, {formatTime(schedule.startTime)}–{formatTime(schedule.endTime)}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Jadwal Baru</h2>
          <p className="mt-0.5 text-xs text-gray-500">Pilih waktu pengganti untuk jadwal ini.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal Baru</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
          />
          <p className="mt-1 text-[11px] text-gray-400">Jadwal rutin baru: setiap hari {DAY_NAMES[dayOfWeek]}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Jam Mulai</label>
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Jam Selesai</label>
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            />
          </div>
        </div>

        {checking && <p className="text-xs text-gray-400">Memeriksa jadwal bentrok...</p>}
        {!checking && conflicts.length > 0 && (
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
            <IconWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800">Jadwal Bentrok</p>
              {conflicts.map((c) => (
                <p key={c.scheduleId} className="mt-0.5 text-xs text-amber-700">
                  Waktu ini tumpang tindih dengan &quot;{c.label}&quot; ({c.startTime}–{c.endTime}).
                </p>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Alasan Perubahan <span className="text-red-600">*</span>
          </label>
          <textarea
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            placeholder="Jelaskan alasan perubahan jadwal..."
          />
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || form.reason.trim().length < 3}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-navy-900 py-3 text-sm font-medium text-white disabled:bg-gray-300 disabled:text-gray-500"
        >
          {submitting ? 'Mengirim...' : 'Kirim Pengajuan'}
        </button>
        <p className="text-center text-[11px] text-gray-400">
          Perubahan berlaku langsung — admin akan menerima catatan pengajuan ini.
        </p>
      </div>
    </div>
  );
}
