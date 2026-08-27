'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import Modal from '@/components/Modal';

interface Subject {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

interface ClassItem {
  id: string;
  name: string;
  level: string | null;
  maxStudents: number;
  status: string;
  subject: { name: string } | null;
}

interface Student {
  id: string;
  name: string;
}

interface Enrollment {
  id: string;
  studentId: string;
  status: string;
  student: { name: string; status: string };
}

export default function AdminClassesPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [subjectForm, setSubjectForm] = useState({ name: '', description: '' });
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [savingSubject, setSavingSubject] = useState(false);

  const [showClassForm, setShowClassForm] = useState(false);
  const [classForm, setClassForm] = useState({ name: '', level: '', subjectId: '', maxStudents: '20' });
  const [classError, setClassError] = useState<string | null>(null);
  const [savingClass, setSavingClass] = useState(false);

  const [rosterClass, setRosterClass] = useState<ClassItem | null>(null);
  const [roster, setRoster] = useState<Enrollment[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [enrollStudentId, setEnrollStudentId] = useState('');
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterBusy, setRosterBusy] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subjRes, classRes, studentRes] = await Promise.all([
        api.get('/subjects'),
        api.get('/classes'),
        api.get('/students'),
      ]);
      setSubjects(subjRes.data.data);
      setClasses(classRes.data.data);
      setStudents(studentRes.data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateSubject(e: React.FormEvent) {
    e.preventDefault();
    setSubjectError(null);
    if (subjectForm.name.trim().length < 2) {
      setSubjectError('Nama mata pelajaran minimal 2 karakter');
      return;
    }
    setSavingSubject(true);
    try {
      await api.post('/subjects', {
        name: subjectForm.name,
        description: subjectForm.description || undefined,
      });
      setShowSubjectForm(false);
      setSubjectForm({ name: '', description: '' });
      await load();
    } catch (err: any) {
      setSubjectError(err.response?.data?.message || 'Gagal menambah mata pelajaran');
    } finally {
      setSavingSubject(false);
    }
  }

  async function deactivateSubject(subject: Subject) {
    if (!confirm(`Nonaktifkan mata pelajaran "${subject.name}"?`)) return;
    setBusyId(subject.id);
    try {
      await api.patch(`/subjects/${subject.id}/deactivate`);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreateClass(e: React.FormEvent) {
    e.preventDefault();
    setClassError(null);
    if (classForm.name.trim().length < 2) {
      setClassError('Nama kelas minimal 2 karakter');
      return;
    }
    setSavingClass(true);
    try {
      await api.post('/classes', {
        name: classForm.name,
        level: classForm.level || undefined,
        subjectId: classForm.subjectId || undefined,
        maxStudents: Number(classForm.maxStudents) || undefined,
      });
      setShowClassForm(false);
      setClassForm({ name: '', level: '', subjectId: '', maxStudents: '20' });
      await load();
    } catch (err: any) {
      setClassError(err.response?.data?.message || 'Gagal menambah kelas');
    } finally {
      setSavingClass(false);
    }
  }

  async function deactivateClass(kelas: ClassItem) {
    if (!confirm(`Nonaktifkan kelas "${kelas.name}"?`)) return;
    setBusyId(kelas.id);
    try {
      await api.patch(`/classes/${kelas.id}/deactivate`);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function openRoster(kelas: ClassItem) {
    setRosterClass(kelas);
    setRosterError(null);
    setEnrollStudentId('');
    setRosterLoading(true);
    try {
      const res = await api.get(`/classes/${kelas.id}/enrollments`);
      setRoster(res.data.data);
    } finally {
      setRosterLoading(false);
    }
  }

  async function enrollStudent() {
    if (!rosterClass || !enrollStudentId) {
      setRosterError('Pilih siswa terlebih dahulu');
      return;
    }
    setRosterBusy(true);
    setRosterError(null);
    try {
      await api.post(`/classes/${rosterClass.id}/enrollments`, { studentId: enrollStudentId });
      const res = await api.get(`/classes/${rosterClass.id}/enrollments`);
      setRoster(res.data.data);
      setEnrollStudentId('');
    } catch (err: any) {
      setRosterError(err.response?.data?.message || 'Gagal menambah siswa ke kelas');
    } finally {
      setRosterBusy(false);
    }
  }

  async function removeFromRoster(studentId: string) {
    if (!rosterClass) return;
    setRosterBusy(true);
    setRosterError(null);
    try {
      await api.patch(`/classes/${rosterClass.id}/enrollments/${studentId}/status`, { status: 'INACTIVE' });
      const res = await api.get(`/classes/${rosterClass.id}/enrollments`);
      setRoster(res.data.data);
    } finally {
      setRosterBusy(false);
    }
  }

  const enrolledIds = new Set(roster.map((r) => r.studentId));
  const availableStudents = students.filter((s) => !enrolledIds.has(s.id));

  return (
    <div className="space-y-8">
      <div>
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-semibold text-gray-900">Mata Pelajaran</h1>
          <button
            onClick={() => setShowSubjectForm(true)}
            className="rounded-md bg-blue-600 text-white text-sm font-medium px-4 py-2 hover:bg-blue-700"
          >
            + Tambah Mapel
          </button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Deskripsi</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    Memuat...
                  </td>
                </tr>
              ) : subjects.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    Belum ada mata pelajaran.
                  </td>
                </tr>
              ) : (
                subjects.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 text-gray-900">{s.name}</td>
                    <td className="px-4 py-3 text-gray-600">{s.description || '-'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {s.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {s.isActive && (
                        <button
                          onClick={() => deactivateSubject(s)}
                          disabled={busyId === s.id}
                          className="text-xs font-medium text-red-600 disabled:opacity-60"
                        >
                          {busyId === s.id ? '...' : 'Nonaktifkan'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-semibold text-gray-900">Kelas Reguler</h1>
          <button
            onClick={() => setShowClassForm(true)}
            className="rounded-md bg-blue-600 text-white text-sm font-medium px-4 py-2 hover:bg-blue-700"
          >
            + Tambah Kelas
          </button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Nama Kelas</th>
                <th className="px-4 py-3 font-medium">Jenjang</th>
                <th className="px-4 py-3 font-medium">Mata Pelajaran</th>
                <th className="px-4 py-3 font-medium">Kapasitas</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    Memuat...
                  </td>
                </tr>
              ) : classes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    Belum ada kelas.
                  </td>
                </tr>
              ) : (
                classes.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600">{c.level || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.subject?.name || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.maxStudents}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          c.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {c.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 space-x-3">
                      <button
                        onClick={() => openRoster(c)}
                        className="text-xs font-medium text-blue-600"
                      >
                        Kelola Siswa
                      </button>
                      {c.status === 'ACTIVE' && (
                        <button
                          onClick={() => deactivateClass(c)}
                          disabled={busyId === c.id}
                          className="text-xs font-medium text-red-600 disabled:opacity-60"
                        >
                          {busyId === c.id ? '...' : 'Nonaktifkan'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showSubjectForm && (
        <Modal title="Tambah Mata Pelajaran" onClose={() => setShowSubjectForm(false)}>
          <form onSubmit={handleCreateSubject} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nama</label>
              <input
                value={subjectForm.name}
                onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Contoh: IPA"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Deskripsi (opsional)</label>
              <input
                value={subjectForm.description}
                onChange={(e) => setSubjectForm({ ...subjectForm, description: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            {subjectError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {subjectError}
              </p>
            )}
            <button
              type="submit"
              disabled={savingSubject}
              className="w-full rounded-md bg-blue-600 text-white text-sm font-medium py-2 hover:bg-blue-700 disabled:opacity-60"
            >
              {savingSubject ? 'Menyimpan...' : 'Simpan'}
            </button>
          </form>
        </Modal>
      )}

      {showClassForm && (
        <Modal title="Tambah Kelas" onClose={() => setShowClassForm(false)}>
          <form onSubmit={handleCreateClass} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nama Kelas</label>
              <input
                value={classForm.name}
                onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Contoh: Kelas 8B"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Jenjang (opsional)</label>
              <input
                value={classForm.level}
                onChange={(e) => setClassForm({ ...classForm, level: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Contoh: SMP"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mata Pelajaran</label>
              <select
                value={classForm.subjectId}
                onChange={(e) => setClassForm({ ...classForm, subjectId: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Pilih mapel</option>
                {subjects
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Kapasitas Maksimal</label>
              <input
                type="number"
                value={classForm.maxStudents}
                onChange={(e) => setClassForm({ ...classForm, maxStudents: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            {classError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {classError}
              </p>
            )}
            <button
              type="submit"
              disabled={savingClass}
              className="w-full rounded-md bg-blue-600 text-white text-sm font-medium py-2 hover:bg-blue-700 disabled:opacity-60"
            >
              {savingClass ? 'Menyimpan...' : 'Simpan'}
            </button>
          </form>
        </Modal>
      )}

      {rosterClass && (
        <Modal title={`Siswa di ${rosterClass.name}`} onClose={() => setRosterClass(null)}>
          {rosterLoading ? (
            <p className="text-sm text-gray-400">Memuat...</p>
          ) : (
            <>
              <ul className="divide-y divide-gray-100 mb-4 max-h-48 overflow-y-auto">
                {roster.length === 0 ? (
                  <li className="py-3 text-sm text-gray-400">Belum ada siswa terdaftar.</li>
                ) : (
                  roster.map((r) => (
                    <li key={r.id} className="py-2 flex justify-between items-center">
                      <span className="text-sm text-gray-700">{r.student.name}</span>
                      <button
                        onClick={() => removeFromRoster(r.studentId)}
                        disabled={rosterBusy}
                        className="text-xs text-red-600 disabled:opacity-60"
                      >
                        Keluarkan
                      </button>
                    </li>
                  ))
                )}
              </ul>

              <div className="flex gap-2">
                <select
                  value={enrollStudentId}
                  onChange={(e) => setEnrollStudentId(e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-2 py-2 text-sm"
                >
                  <option value="">Pilih siswa untuk ditambahkan</option>
                  {availableStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={enrollStudent}
                  disabled={rosterBusy}
                  className="rounded-md bg-blue-600 text-white text-sm font-medium px-4 py-2 hover:bg-blue-700 disabled:opacity-60"
                >
                  Tambah
                </button>
              </div>

              {rosterError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mt-3">
                  {rosterError}
                </p>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
