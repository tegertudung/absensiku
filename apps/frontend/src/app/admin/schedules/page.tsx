'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import Modal from '@/components/Modal';

interface Schedule {
  id: string;
  sessionType: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  status: string;
  tutor: { name: string };
  class: { name: string } | null;
  student: { name: string } | null;
  subject: { name: string } | null;
}

interface Option {
  id: string;
  name: string;
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AdminSchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [tutors, setTutors] = useState<Option[]>([]);
  const [classes, setClasses] = useState<Option[]>([]);
  const [students, setStudents] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [form, setForm] = useState({
    tutorId: '',
    sessionType: 'REGULAR',
    classId: '',
    studentId: '',
    subjectId: '',
    dayOfWeek: '1',
    startTime: '09:00',
    endTime: '10:30',
    startDate: new Date().toISOString().split('T')[0],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schedRes, tutorRes, classRes, studentRes, subjectRes] = await Promise.all([
        api.get('/schedules'),
        api.get('/tutors'),
        api.get('/classes'),
        api.get('/students'),
        api.get('/subjects'),
      ]);
      setSchedules(schedRes.data.data);
      setTutors(tutorRes.data.data.map((t: any) => ({ id: t.id, name: t.name })));
      setClasses(classRes.data.data.map((c: any) => ({ id: c.id, name: c.name })));
      setStudents(studentRes.data.data.map((s: any) => ({ id: s.id, name: s.name })));
      setSubjects(subjectRes.data.data.map((s: any) => ({ id: s.id, name: s.name })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.tutorId) {
      setFormError('Pilih tentor');
      return;
    }
    if (form.sessionType === 'REGULAR' && !form.classId) {
      setFormError('Pilih kelas untuk jadwal reguler');
      return;
    }
    if (form.sessionType === 'PRIVATE' && !form.studentId) {
      setFormError('Pilih siswa untuk jadwal privat');
      return;
    }

    setSaving(true);
    try {
      await api.post('/schedules', {
        tutorId: form.tutorId,
        sessionType: form.sessionType,
        classId: form.sessionType === 'REGULAR' ? form.classId : undefined,
        studentId: form.sessionType === 'PRIVATE' ? form.studentId : undefined,
        subjectId: form.subjectId || undefined,
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime,
        endTime: form.endTime,
        startDate: form.startDate,
      });
      setShowForm(false);
      await load();
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Gagal menambah jadwal');
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(schedule: Schedule, status: string) {
    setBusyId(schedule.id);
    try {
      await api.patch(`/schedules/${schedule.id}/status`, { status });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Jadwal</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md bg-blue-600 text-white text-sm font-medium px-4 py-2 hover:bg-blue-700"
        >
          + Tambah Jadwal
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Hari/Jam</th>
              <th className="px-4 py-3 font-medium">Tentor</th>
              <th className="px-4 py-3 font-medium">Jenis</th>
              <th className="px-4 py-3 font-medium">Kelas/Siswa</th>
              <th className="px-4 py-3 font-medium">Mapel</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Memuat...
                </td>
              </tr>
            ) : schedules.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Belum ada jadwal.
                </td>
              </tr>
            ) : (
              schedules.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-600">
                    {DAY_NAMES[s.dayOfWeek]}, {formatTime(s.startTime)}–{formatTime(s.endTime)}
                  </td>
                  <td className="px-4 py-3 text-gray-900">{s.tutor.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.sessionType === 'REGULAR' ? 'Reguler' : 'Privat'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.sessionType === 'REGULAR' ? s.class?.name : s.student?.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.subject?.name || '-'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={s.status}
                      disabled={busyId === s.id}
                      onChange={(e) => setStatus(s, e.target.value)}
                      className="text-xs rounded-md border border-gray-300 px-2 py-1 disabled:opacity-60"
                    >
                      <option value="ACTIVE">Aktif</option>
                      <option value="INACTIVE">Nonaktif</option>
                      <option value="CANCELLED">Dibatalkan</option>
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Tambah Jadwal" onClose={() => setShowForm(false)}>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Jenis Sesi</label>
              <select
                value={form.sessionType}
                onChange={(e) => setForm({ ...form, sessionType: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="REGULAR">Reguler</option>
                <option value="PRIVATE">Privat</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tentor</label>
              <select
                value={form.tutorId}
                onChange={(e) => setForm({ ...form, tutorId: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Pilih tentor</option>
                {tutors.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {form.sessionType === 'REGULAR' ? (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Kelas</label>
                <select
                  value={form.classId}
                  onChange={(e) => setForm({ ...form, classId: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Pilih kelas</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Siswa</label>
                <select
                  value={form.studentId}
                  onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Pilih siswa</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mata Pelajaran</label>
              <select
                value={form.subjectId}
                onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Pilih mapel</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hari</label>
              <select
                value={form.dayOfWeek}
                onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {DAY_NAMES.map((d, i) => (
                  <option key={i} value={i}>
                    {d}
                  </option>
                ))}
              </select>
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
              <label className="block text-xs font-medium text-gray-700 mb-1">Mulai Berlaku</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            {formError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md bg-blue-600 text-white text-sm font-medium py-2 hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
