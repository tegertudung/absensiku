'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { IconChevronLeft, IconWarning } from '@/components/icons';

interface Option {
  id: string;
  name: string;
}

interface ConflictRow {
  scheduleId: string;
  sessionType: string;
  label: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];

function todayISODate() {
  return new Date().toISOString().split('T')[0];
}

export default function TentorNewPrivatePage() {
  const router = useRouter();
  const [students, setStudents] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [studentQuery, setStudentQuery] = useState('');

  const [form, setForm] = useState({
    studentId: '',
    subjectId: '',
    startDate: todayISODate(),
    startTime: '16:00',
    endTime: '17:30',
    mode: 'OFFLINE',
    location: '',
    notes: '',
  });

  const [dayOfWeek, setDayOfWeek] = useState<number>(new Date().getDay());
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/students').then((res) => setStudents(res.data.data.map((s: any) => ({ id: s.id, name: s.name }))));
    api.get('/subjects').then((res) => setSubjects(res.data.data.map((s: any) => ({ id: s.id, name: s.name }))));
  }, []);

  useEffect(() => {
    setDayOfWeek(new Date(`${form.startDate}T00:00:00`).getDay());
  }, [form.startDate]);

  // Pre-save conflict check — mirrors the mockup's inline "Jadwal Bentrok" card,
  // shown as soon as date/time changes rather than only after submitting.
  useEffect(() => {
    if (!form.startDate || !form.startTime || !form.endTime) return;
    if (form.startTime >= form.endTime) {
      setConflicts([]);
      return;
    }
    const handle = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await api.post('/schedules/check-conflicts', {
          dayOfWeek,
          startDate: form.startDate,
          startTime: form.startTime,
          endTime: form.endTime,
        });
        setConflicts(res.data.data);
      } catch {
        // Silent — conflict pre-check is a convenience, not a blocking validation.
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [dayOfWeek, form.startDate, form.startTime, form.endTime]);

  const filteredStudents = studentQuery
    ? students.filter((s) => s.name.toLowerCase().includes(studentQuery.toLowerCase()))
    : students;

  async function handleSubmit() {
    setError(null);
    if (!form.studentId) return setError('Pilih siswa terlebih dahulu.');
    if (!form.subjectId) return setError('Pilih mata pelajaran.');
    if (form.startTime >= form.endTime) return setError('Jam mulai harus sebelum jam selesai.');

    setSubmitting(true);
    try {
      await api.post('/schedules', {
        sessionType: 'PRIVATE',
        studentId: form.studentId,
        subjectId: form.subjectId,
        dayOfWeek,
        startDate: form.startDate,
        startTime: form.startTime,
        endTime: form.endTime,
        mode: form.mode,
        location: form.mode === 'OFFLINE' && form.location.trim() ? form.location.trim() : undefined,
        notes: form.notes || undefined,
      });
      router.push('/tentor/schedule');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Gagal menyimpan jadwal privat.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500">
        <IconChevronLeft className="w-4 h-4" />
        Kembali
      </button>

      <h1 className="text-lg font-semibold text-gray-900">Tambah Jadwal Privat</h1>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Cari Siswa</label>
          <input
            type="text"
            value={studentQuery}
            onChange={(e) => setStudentQuery(e.target.value)}
            placeholder="Ketik nama siswa..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-2"
          />
          <select
            value={form.studentId}
            onChange={(e) => setForm({ ...form, studentId: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Pilih siswa</option>
            {filteredStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Mata Pelajaran</label>
          <select
            value={form.subjectId}
            onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Pilih mata pelajaran</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal</label>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Jadwal rutin setiap hari {DAY_NAMES[dayOfWeek]}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Jam Mulai</label>
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Jam Selesai</label>
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Mode</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, mode: 'OFFLINE' })}
              className={`flex-1 rounded-md border py-2 text-sm font-medium ${
                form.mode === 'OFFLINE' ? 'border-navy-900 bg-navy-900 text-white' : 'border-gray-300 text-gray-600'
              }`}
            >
              Offline
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, mode: 'ONLINE' })}
              className={`flex-1 rounded-md border py-2 text-sm font-medium ${
                form.mode === 'ONLINE' ? 'border-navy-900 bg-navy-900 text-white' : 'border-gray-300 text-gray-600'
              }`}
            >
              Online
            </button>
          </div>
        </div>

        {form.mode === 'OFFLINE' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Lokasi (opsional)</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="cth. Cabang Sudirman"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        )}

        {checking && <p className="text-xs text-gray-400">Memeriksa jadwal bentrok...</p>}

        {!checking && conflicts.length > 0 && (
          <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-3">
            <IconWarning className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Jadwal Bentrok</p>
              {conflicts.map((c) => (
                <p key={c.scheduleId} className="text-xs text-amber-700 mt-0.5">
                  Waktu ini tumpang tindih dengan &quot;{c.label}&quot; ({c.startTime}–{c.endTime}).
                </p>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Catatan (opsional)</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Catatan tambahan..."
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-md bg-navy-900 text-white text-sm font-medium py-2.5 disabled:opacity-60 hover:bg-navy-800"
        >
          {submitting ? 'Menyimpan...' : 'Simpan Jadwal Privat'}
        </button>
        {conflicts.length > 0 && (
          <p className="text-[11px] text-center text-gray-400">
            Jadwal tetap bisa disimpan meski bentrok — admin akan meninjau ulang.
          </p>
        )}
      </div>
    </div>
  );
}
