'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import Modal from '@/components/Modal';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import SectionCard from '@/components/SectionCard';
import EmptyState from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { IconClasses, IconPlus, IconReport } from '@/components/icons';

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
  quotaTotal?: number;
  quotaRemaining?: number;
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
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [deleteSubjectTarget, setDeleteSubjectTarget] = useState<Subject | null>(null);
  const [subjectForm, setSubjectForm] = useState({ name: '', description: '' });
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [savingSubject, setSavingSubject] = useState(false);

  const [showClassForm, setShowClassForm] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
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
  const [deleteClassTarget, setDeleteClassTarget] = useState<ClassItem | null>(null);

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
      const payload = {
        name: subjectForm.name,
        description: subjectForm.description || undefined,
      };
      if (editingSubjectId) await api.put(`/subjects/${editingSubjectId}`, payload);
      else await api.post('/subjects', payload);
      setShowSubjectForm(false);
      setEditingSubjectId(null);
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
      const payload = {
        name: classForm.name,
        level: classForm.level || undefined,
        subjectId: classForm.subjectId || undefined,
        maxStudents: Number(classForm.maxStudents) || undefined,
      };
      if (editingClassId) await api.put(`/classes/${editingClassId}`, payload);
      else await api.post('/classes', payload);
      setShowClassForm(false);
      setEditingClassId(null);
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

  async function deleteSubject() {
    if (!deleteSubjectTarget) return;
    setBusyId(deleteSubjectTarget.id);
    try { await api.delete(`/subjects/${deleteSubjectTarget.id}`); setDeleteSubjectTarget(null); await load(); }
    catch (err: any) { setSubjectError(err.response?.data?.message || 'Gagal menghapus mata pelajaran'); }
    finally { setBusyId(null); }
  }

  async function deleteClass() {
    if (!deleteClassTarget) return;
    setBusyId(deleteClassTarget.id);
    try {
      await api.delete(`/classes/${deleteClassTarget.id}`);
      setDeleteClassTarget(null);
      await load();
    } catch (err: any) {
      setClassError(err.response?.data?.message || 'Gagal menghapus kelas');
    } finally {
      setBusyId(null);
    }
  }

  async function extendClassQuota() {
    if (!rosterClass) return;
    setRosterBusy(true);
    try {
      await api.post(`/classes/${rosterClass.id}/extend-quota`);
      await load();
      setRosterClass((current) => current ? { ...current, quotaTotal: (current.quotaTotal ?? 0) + 24, quotaRemaining: (current.quotaRemaining ?? 0) + 24 } : current);
    } catch (err: any) {
      setRosterError(err.response?.data?.message || 'Gagal menambah pertemuan kelas');
    } finally { setRosterBusy(false); }
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
    <div className="space-y-5">
      <PageHeader title="Kelas & Mapel" description="Kelola kelas, mata pelajaran, dan kuota pertemuan." action={<div className="flex gap-2"><button onClick={() => { setEditingSubjectId(null); setSubjectForm({ name: '', description: '' }); setShowSubjectForm(true); }} className="inline-flex h-10 items-center gap-2 rounded-lg border border-navy-900 px-4 text-sm font-medium text-navy-900 hover:bg-navy-50"><IconReport className="h-4 w-4"/>Tambah Mapel</button><button onClick={() => { setEditingClassId(null); setClassForm({ name: '', level: '', subjectId: '', maxStudents: '20' }); setShowClassForm(true); }} className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800"><IconPlus className="h-4 w-4"/>Tambah Kelas</button></div>}/>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3"><StatCard label="Total Kelas" value={classes.length} icon={<IconClasses className="h-5 w-5"/>}/><StatCard label="Kelas Aktif" value={classes.filter(c=>c.status==='ACTIVE').length} icon={<IconClasses className="h-5 w-5"/>}/><StatCard label="Mata Pelajaran" value={subjects.filter(s=>s.isActive).length} icon={<IconReport className="h-5 w-5"/>}/></div>
      <SectionCard title="Mata Pelajaran" description="Daftar mata pelajaran yang dapat digunakan pada kelas dan jadwal.">
        <div className="flex justify-between items-center mb-4">
          <span className="text-xs text-gray-500">{subjects.length} mata pelajaran</span>
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
                      <div className="flex gap-3 text-xs font-medium"><button onClick={() => { setSubjectForm({ name: s.name, description: s.description || '' }); setEditingSubjectId(s.id); setShowSubjectForm(true); }} className="text-navy-900 hover:underline">Detail</button><button onClick={() => { setSubjectForm({ name: s.name, description: s.description || '' }); setEditingSubjectId(s.id); setShowSubjectForm(true); }} className="text-gray-700 hover:underline">Edit</button><button onClick={() => setDeleteSubjectTarget(s)} className="text-red-600 hover:underline">Hapus</button></div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Kelas Reguler" description="Kuota pertemuan melekat pada kelas, bukan pada masing-masing siswa.">
        <div className="flex justify-between items-center mb-4">
          <span className="text-xs text-gray-500">{classes.length} kelas tersedia</span>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Nama Kelas</th>
                <th className="px-4 py-3 font-medium">Jenjang</th>
                <th className="px-4 py-3 font-medium">Mata Pelajaran</th>
                <th className="px-4 py-3 font-medium">Sisa Pertemuan</th>
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
                    <td className={`px-4 py-3 text-sm font-medium ${(c.quotaRemaining ?? 0) === 0 ? 'text-red-700' : (c.quotaRemaining ?? 999) <= 3 ? 'text-amber-700' : 'text-gray-700'}`}>{c.quotaRemaining ?? '-'} / {c.quotaTotal ?? '-'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3 text-xs font-medium">
                        <button onClick={() => openRoster(c)} className="text-navy-900 hover:underline">Detail</button>
                        <button onClick={() => { setEditingClassId(c.id); setClassForm({ name: c.name, level: c.level || '', subjectId: '', maxStudents: String(c.maxStudents) }); setShowClassForm(true); }} className="text-gray-700 hover:underline">Edit</button>
                        <button onClick={() => setDeleteClassTarget(c)} className="text-red-600 hover:underline">Hapus</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {showSubjectForm && (
        <Modal title={editingSubjectId ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran'} onClose={() => { setShowSubjectForm(false); setEditingSubjectId(null); }}>
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
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4"><button type="button" onClick={() => setShowSubjectForm(false)} className="rounded-md border border-gray-300 px-4 py-2 text-sm">Batal</button><button type="submit" disabled={savingSubject} className="rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{savingSubject ? 'Menyimpan...' : editingSubjectId ? 'Simpan Perubahan' : 'Simpan'}</button></div>
          </form>
        </Modal>
      )}

      {showClassForm && (
        <Modal title={editingClassId ? 'Edit Kelas' : 'Tambah Kelas'} onClose={() => { setShowClassForm(false); setEditingClassId(null); }}>
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
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4"><button type="button" onClick={() => setShowClassForm(false)} className="rounded-md border border-gray-300 px-4 py-2 text-sm">Batal</button><button type="submit" disabled={savingClass} className="rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{savingClass ? 'Menyimpan...' : editingClassId ? 'Simpan Perubahan' : 'Simpan'}</button></div>
          </form>
        </Modal>
      )}

      {rosterClass && (
        <Modal title={`Detail Kelas — ${rosterClass.name}`} onClose={() => setRosterClass(null)}>
          {rosterLoading ? (
            <p className="text-sm text-gray-400">Memuat...</p>
          ) : (
            <>
              <section className="mb-4 rounded-lg border border-navy-100 bg-navy-50 p-3"><p className="text-xs font-semibold text-navy-900">Kuota Pertemuan Kelas</p><p className="mt-1 text-sm text-navy-900">Sisa {rosterClass.quotaRemaining ?? '-'} dari {rosterClass.quotaTotal ?? '-'} pertemuan</p><button onClick={extendClassQuota} disabled={rosterBusy} className="mt-3 rounded-md bg-navy-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">{rosterBusy ? 'Memproses...' : 'Tambah 24 Pertemuan'}</button></section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Daftar Siswa</p>
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
                  className="rounded-md bg-navy-900 text-white text-sm font-medium px-4 py-2 hover:bg-navy-800 disabled:opacity-60"
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

      {deleteClassTarget && (
        <Modal title="Hapus Kelas?" onClose={() => setDeleteClassTarget(null)}>
          <p className="text-sm leading-6 text-gray-600">Kelas &quot;{deleteClassTarget.name}&quot; akan dihapus. Kelas yang masih memiliki jadwal atau riwayat sesi tidak dapat dihapus.</p>
          {classError && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{classError}</p>}
          <div className="mt-5 flex justify-end gap-2"><button onClick={() => setDeleteClassTarget(null)} disabled={busyId === deleteClassTarget.id} className="rounded-md border border-gray-300 px-4 py-2 text-sm">Batal</button><button onClick={deleteClass} disabled={busyId === deleteClassTarget.id} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busyId === deleteClassTarget.id ? 'Menghapus...' : 'Hapus'}</button></div>
        </Modal>
      )}

      {deleteSubjectTarget && (
        <Modal title="Hapus Mata Pelajaran?" onClose={() => setDeleteSubjectTarget(null)}><p className="text-sm leading-6 text-gray-600">Mata pelajaran &quot;{deleteSubjectTarget.name}&quot; akan dihapus. Data yang masih digunakan oleh kelas, jadwal, atau riwayat sesi akan tetap dilindungi.</p>{subjectError && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{subjectError}</p>}<div className="mt-5 flex justify-end gap-2"><button onClick={() => setDeleteSubjectTarget(null)} className="rounded-md border border-gray-300 px-4 py-2 text-sm">Batal</button><button onClick={deleteSubject} disabled={busyId === deleteSubjectTarget.id} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busyId === deleteSubjectTarget.id ? 'Menghapus...' : 'Hapus'}</button></div></Modal>
      )}
    </div>
  );
}
