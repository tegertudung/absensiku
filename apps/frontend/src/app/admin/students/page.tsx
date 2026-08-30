'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import Modal from '@/components/Modal';
import { formatDate } from '@/lib/format';
import PageHeader from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { IconPlus, IconSearch } from '@/components/icons';
import StatCard from '@/components/StatCard';
import { IconClasses, IconPrivate } from '@/components/icons';

interface Student {
  id: string;
  name: string;
  phone: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  status: string;
  hasOperationalHistory: boolean;
  programs: Array<{
    type: 'REGULAR' | 'PRIVATE';
    label: string;
    quotaTotal: number;
    quotaUsed: number;
    quotaRemaining: number;
  }>;
}

interface PrivatePackage {
  id: string;
  quotaTotal: number;
  quotaUsed: number;
  quotaRemaining: number;
  status: string;
  packageName: string | null;
  activationDate: string;
}

interface ClassOption {
  id: string;
  name: string;
  subject: { name: string } | null;
}

const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'GRADUATED'];
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktif',
  INACTIVE: 'Nonaktif',
  GRADUATED: 'Lulus',
};

const PACKAGE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktif',
  EXPIRED: 'Habis Masa',
  CANCELLED: 'Dibatalkan',
};

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [programError, setProgramError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [programFilter, setProgramFilter] = useState('ALL');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', guardianName: '', guardianPhone: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [packageConfirm, setPackageConfirm] = useState<'ACTIVATE' | 'EXTEND' | null>(null);

  const [form, setForm] = useState({ name: '', phone: '', guardianName: '', guardianPhone: '' });
  const [program, setProgram] = useState<'REGULAR' | 'PRIVATE'>('REGULAR');
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [createdStudentId, setCreatedStudentId] = useState<string | null>(null);

  const [pkgStudent, setPkgStudent] = useState<Student | null>(null);
  const [packages, setPackages] = useState<PrivatePackage[]>([]);
  const [pkgLoading, setPkgLoading] = useState(false);
  const [pkgError, setPkgError] = useState<string | null>(null);
  const [pkgBusy, setPkgBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/students');
      setStudents(res.data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function loadClasses() {
    setClassesLoading(true);
    try {
      const res = await api.get('/classes');
      setClasses(res.data.data);
    } catch {
      setProgramError('Gagal memuat kelas reguler. Silakan coba lagi.');
    } finally {
      setClassesLoading(false);
    }
  }

  function resetCreateForm() {
    setForm({ name: '', phone: '', guardianName: '', guardianPhone: '' });
    setProgram('REGULAR');
    setSelectedClassId('');
    setCreatedStudentId(null);
    setFormError(null);
    setPhoneError(null);
    setProgramError(null);
  }

  async function openCreateForm() {
    setSuccessMessage(null);
    resetCreateForm();
    setShowForm(true);
    await loadClasses();
  }

  async function closeCreateForm() {
    if (saving) return;
    setShowForm(false);
    if (createdStudentId) await load();
    resetCreateForm();
  }

  function validateProgram() {
    if (program === 'REGULAR' && !selectedClassId) {
      setProgramError('Pilih kelas reguler terlebih dahulu.');
      return false;
    }

    return true;
  }

  async function assignProgram(studentId: string) {
    if (program === 'REGULAR') {
      await api.post(`/classes/${selectedClassId}/enrollments`, { studentId });
      return;
    }
    await api.post('/private-packages', { studentId, quotaTotal: 24 });
  }

  async function finishCreate() {
    setSuccessMessage(
      program === 'REGULAR'
        ? 'Siswa berhasil ditambahkan ke kelas reguler.'
        : 'Siswa privat berhasil ditambahkan dan paket diaktifkan.'
    );
    setShowForm(false);
    resetCreateForm();
    await load();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setProgramError(null);

    if (!createdStudentId && (!form.name || form.name.trim().length < 2)) {
      setFormError('Nama siswa minimal 2 karakter');
      return;
    }
    const normalizedPhone = form.phone.replace(/\D/g, '');
    if (!normalizedPhone) {
      setPhoneError('Nomor telepon wajib diisi.');
      return;
    }
    if (normalizedPhone.length > 13) {
      setPhoneError('Nomor telepon maksimal 13 digit.');
      return;
    }
    setPhoneError(null);
    if (!validateProgram()) return;

    setSaving(true);
    try {
      const studentId = createdStudentId || (await api.post('/students', { ...form, phone: normalizedPhone })).data.data.id;
      if (!createdStudentId) setCreatedStudentId(studentId);

      try {
        await assignProgram(studentId);
        await finishCreate();
      } catch (err: any) {
        setFormError(
          program === 'REGULAR'
            ? 'Siswa berhasil dibuat, tetapi belum berhasil dimasukkan ke kelas. Silakan coba lagi.'
            : 'Siswa berhasil dibuat, tetapi paket privat belum berhasil diaktifkan. Silakan coba lagi.'
        );
      }
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Gagal menambah siswa');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(student: Student, status: string) {
    if (status === student.status) return;
    setBusyId(student.id);
    try {
      await api.patch(`/students/${student.id}/status`, { status });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function openPackages(student: Student) {
    setPkgStudent(student);
    setPkgError(null);
    setPkgLoading(true);
    try {
      const res = await api.get('/private-packages', { params: { studentId: student.id } });
      setPackages(res.data.data);
    } finally {
      setPkgLoading(false);
    }
  }

  async function refreshPackages() {
    if (!pkgStudent) return;
    const res = await api.get('/private-packages', { params: { studentId: pkgStudent.id } });
    setPackages(res.data.data);
  }

  async function activatePackage() {
    if (!pkgStudent) return;
    setPkgBusy(true);
    setPkgError(null);
    try {
      await api.post('/private-packages', { studentId: pkgStudent.id, quotaTotal: 24 });
      setPackageConfirm(null);
      await refreshPackages();
    } catch (err: any) {
      setPkgError(err.response?.data?.message || 'Gagal mengaktifkan paket');
    } finally {
      setPkgBusy(false);
    }
  }

  async function extendActivePackage(pkgId: string) {
    setPkgBusy(true);
    setPkgError(null);
    try {
      await api.post(`/private-packages/${pkgId}/extend`, { additionalQuota: 24 });
      setPackageConfirm(null);
      await refreshPackages();
    } catch (err: any) {
      setPkgError(err.response?.data?.message || 'Gagal menambah kuota');
    } finally {
      setPkgBusy(false);
    }
  }

  const activePackage = packages.find((p) => p.status === 'ACTIVE');
  const visibleStudents = students.filter((student) => {
    const query = search.toLocaleLowerCase();
    const matchesSearch = student.name.toLocaleLowerCase().includes(query) || (student.phone || '').includes(search);
    const matchesStatus = statusFilter === 'ALL' || student.status === statusFilter;
    const matchesProgram =
      programFilter === 'ALL' || student.programs.some((item) => item.type === programFilter);
    return matchesSearch && matchesStatus && matchesProgram;
  });

  const availableProgramTypes = new Set(students.flatMap((student) => student.programs.map((item) => item.type)));

  function initials(name: string) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  async function deleteStudent() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await api.delete(`/students/${deleteTarget.id}`);
      setDeleteTarget(null);
      setDeleteAcknowledged(false);
      setSuccessMessage('Siswa berhasil dihapus permanen.');
      await load();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Gagal menghapus siswa.');
      setDeleteTarget(null);
    } finally {
      setBusyId(null);
    }
  }

  function openEdit(student: Student) {
    setActionMenuId(null);
    setEditError(null);
    setEditForm({
      name: student.name,
      phone: student.phone || '',
      guardianName: student.guardianName || '',
      guardianPhone: student.guardianPhone || '',
    });
    setEditingStudent(student);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStudent) return;
    const phone = editForm.phone.replace(/\D/g, '');
    if (!editForm.name.trim()) return setEditError('Nama siswa wajib diisi.');
    if (!phone) return setEditError('Nomor telepon wajib diisi.');
    if (phone.length > 13) return setEditError('Nomor telepon maksimal 13 digit.');
    setEditSaving(true);
    setEditError(null);
    try {
      await api.put(`/students/${editingStudent.id}`, { ...editForm, name: editForm.name.trim(), phone });
      setEditingStudent(null);
      setSuccessMessage('Data siswa berhasil diperbarui.');
      await load();
    } catch (err: any) {
      setEditError(err.response?.data?.message || 'Gagal memperbarui data siswa.');
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs font-medium text-gray-400"><span>Admin</span><span aria-hidden="true">/</span><span className="text-gray-600">Data Siswa</span></nav>
      <PageHeader
        title="Siswa"
        description="Kelola data siswa, kelas reguler, dan paket privat."
        action={
          <button
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-navy-800"
          >
            <IconPlus className="h-4 w-4" />
            Tambah Siswa
          </button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Total Siswa" value={students.length} icon={<IconClasses className="h-5 w-5" />} />
        <StatCard label="Siswa Reguler" value={students.filter((student) => student.programs.some((item) => item.type === 'REGULAR')).length} icon={<IconClasses className="h-5 w-5" />} />
        <StatCard label="Siswa Privat" value={students.filter((student) => student.programs.some((item) => item.type === 'PRIVATE')).length} icon={<IconPrivate className="h-5 w-5" />} />
      </div>

      <div className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1 lg:max-w-xl">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama atau nomor telepon siswa"
              aria-label="Cari nama siswa"
              className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100"
            />
          </div>
          <select
            value={programFilter}
            onChange={(event) => setProgramFilter(event.target.value)}
            disabled={availableProgramTypes.size === 0}
            aria-label="Filter program"
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="ALL">{availableProgramTypes.size === 0 ? 'Program belum tersedia' : 'Semua Program'}</option>
            {availableProgramTypes.has('REGULAR') && <option value="REGULAR">Reguler</option>}
            {availableProgramTypes.has('PRIVATE') && <option value="PRIVATE">Privat</option>}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter status siswa"
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100"
          >
            <option value="ALL">Semua Status</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Nama Siswa</th>
              <th className="px-4 py-3">Program</th>
              <th className="px-4 py-3">Kelas / Paket</th>
              <th className="px-4 py-3">Sisa Sesi</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-5 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  Memuat...
                </td>
              </tr>
            ) : visibleStudents.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  {students.length === 0 ? 'Belum ada data siswa.' : 'Tidak ada siswa yang sesuai dengan filter.'}
                </td>
              </tr>
            ) : (
              visibleStudents.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 text-gray-900">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-100 text-[11px] font-semibold text-navy-700">
                        {initials(s.name)}
                      </div>
                      <div className="min-w-0">
                        <Link href={`/admin/students/${s.id}`} className="font-medium text-gray-900 hover:text-navy-700">
                          {s.name}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-gray-500">{s.phone || 'Kontak belum tersedia'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    {s.programs.length === 0 ? (
                      <span className="text-xs text-gray-400">Belum ada program</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {s.programs.map((item, index) => (
                          <span key={`${item.type}-${item.label}-${index}`} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${item.type === 'PRIVATE' ? 'bg-navy-100 text-navy-800' : 'bg-blue-100 text-blue-800'}`}>
                            {item.type === 'PRIVATE' ? 'Privat' : 'Reguler'}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-600">
                    {s.programs.length ? s.programs.map((item, index) => <p key={`${item.type}-${item.label}-${index}`}>{item.label}</p>) : '-'}
                  </td>
                  <td className="px-4 py-3.5">
                    {s.programs.length ? (
                      <div className="space-y-1">
                        {s.programs.map((item, index) => {
                          const isEmpty = item.quotaRemaining === 0;
                          const isLow = item.quotaRemaining > 0 && item.quotaRemaining <= 3;
                          const progress = item.quotaTotal ? Math.max(0, Math.min(100, (item.quotaRemaining / item.quotaTotal) * 100)) : 0;
                          return (
                            <div key={`${item.type}-${item.label}-${index}`} className="min-w-[100px]">
                              <p className={`text-xs font-medium ${isEmpty ? 'text-red-700' : isLow ? 'text-amber-700' : 'text-gray-700'}`}>{item.quotaRemaining} / {item.quotaTotal}</p>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={isEmpty ? 'h-full bg-red-500' : isLow ? 'h-full bg-amber-500' : 'h-full bg-navy-600'} style={{ width: `${progress}%` }} /></div>
                              {isEmpty && <p className="mt-0.5 text-[10px] font-medium text-red-600">Pertemuan habis</p>}
                            </div>
                          );
                        })}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="relative inline-block text-left">
                      <button onClick={() => setActionMenuId(actionMenuId === s.id ? null : s.id)} aria-label={`Aksi ${s.name}`} className="rounded-md px-2 py-1 text-lg leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-800">•••</button>
                      {actionMenuId === s.id && (
                        <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 text-left shadow-lg">
                          <Link href={`/admin/students/${s.id}`} className="block rounded-md px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">Detail</Link>
                          <button onClick={() => openEdit(s)} className="block w-full rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50">Edit</button>
                          <button onClick={() => { setActionMenuId(null); openPackages(s); }} className="block w-full rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50">Kelola Paket Privat</button>
                          <div className="my-1 border-t border-gray-100" />
                          <button onClick={() => { setActionMenuId(null); setDeleteAcknowledged(false); setDeleteTarget(s); }} className="block w-full rounded-md px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50">Hapus</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {successMessage && (
        <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {successMessage}
        </p>
      )}
      {actionError && (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      {showForm && (
        <Modal title="Tambah Siswa" onClose={closeCreateForm} className="max-w-3xl">
          <form onSubmit={handleCreate} className="space-y-5">
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-gray-900">Informasi Siswa</h2>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  Lengkapi informasi di bawah ini untuk menambahkan siswa baru ke dalam sistem.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="student-name" className="mb-1.5 block text-xs font-medium text-gray-700">
                    Nama Siswa <span className="text-red-600" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="student-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    aria-invalid={Boolean(formError)}
                    required
                    disabled={saving || Boolean(createdStudentId)}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="Masukkan nama siswa"
                  />
                </div>
                <div>
                  <label htmlFor="student-phone" className="mb-1.5 block text-xs font-medium text-gray-700">Nomor Telepon <span className="text-red-600" aria-hidden="true">*</span></label>
                  <input
                    id="student-phone"
                    value={form.phone}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 13);
                      setForm({ ...form, phone: value });
                      setPhoneError(value ? null : 'Nomor telepon wajib diisi.');
                    }}
                    inputMode="numeric"
                    maxLength={13}
                    required
                    aria-invalid={Boolean(phoneError)}
                    disabled={saving || Boolean(createdStudentId)}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="Contoh: 081234567890"
                  />
                  {phoneError && <p role="alert" className="mt-1 text-xs text-red-700">{phoneError}</p>}
                </div>
                <div>
                  <label htmlFor="guardian-name" className="mb-1.5 block text-xs font-medium text-gray-700">Nama Orang Tua/Wali</label>
                  <input
                    id="guardian-name"
                    value={form.guardianName}
                    onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
                    disabled={saving || Boolean(createdStudentId)}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="Masukkan nama orang tua/wali"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="guardian-phone" className="mb-1.5 block text-xs font-medium text-gray-700">Telepon Orang Tua/Wali</label>
                  <input
                    id="guardian-phone"
                    value={form.guardianPhone}
                    onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })}
                    disabled={saving || Boolean(createdStudentId)}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="Masukkan nomor telepon orang tua/wali"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-gray-900">Program Belajar</h2>
                <p className="mt-1 text-xs leading-5 text-gray-500">Tentukan program awal siswa.</p>
              </div>
              <fieldset disabled={saving || Boolean(createdStudentId)}>
                <legend className="sr-only">Pilih program belajar</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { value: 'REGULAR', label: 'Reguler', description: 'Daftarkan siswa ke kelas reguler.' },
                    { value: 'PRIVATE', label: 'Privat', description: 'Aktifkan paket sesi privat.' },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                        program === option.value
                          ? 'border-navy-600 bg-navy-50 ring-1 ring-navy-600'
                          : 'border-gray-200 hover:border-gray-300'
                      } ${saving || createdStudentId ? 'cursor-not-allowed opacity-70' : ''}`}
                    >
                      <input
                        type="radio"
                        name="student-program"
                        value={option.value}
                        checked={program === option.value}
                        onChange={() => {
                          setProgram(option.value as 'REGULAR' | 'PRIVATE');
                          setProgramError(null);
                        }}
                        className="mt-0.5 h-4 w-4 border-gray-300 text-navy-700 focus:ring-navy-500"
                      />
                      <span>
                        <span className="block text-sm font-medium text-gray-900">{option.label}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-gray-500">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="mt-4">
                {program === 'REGULAR' ? (
                  <div>
                    <label htmlFor="regular-class" className="mb-1.5 block text-xs font-medium text-gray-700">
                      Kelas Reguler <span className="text-red-600" aria-hidden="true">*</span>
                    </label>
                    <select
                      id="regular-class"
                      value={selectedClassId}
                      onChange={(e) => { setSelectedClassId(e.target.value); setProgramError(null); }}
                      disabled={saving || Boolean(createdStudentId) || classesLoading}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100 disabled:bg-gray-50 disabled:text-gray-500"
                    >
                      <option value="">{classesLoading ? 'Memuat kelas...' : 'Pilih kelas reguler'}</option>
                      {classes.map((kelas) => (
                        <option key={kelas.id} value={kelas.id}>
                          {kelas.name}{kelas.subject?.name ? ` — ${kelas.subject.name}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : <p className="rounded-lg border border-navy-100 bg-navy-50 px-3 py-2 text-xs text-navy-800">Paket privat awal akan diaktifkan dengan 24 pertemuan.</p>}
                {programError && <p role="alert" className="mt-2 text-xs text-red-700">{programError}</p>}
              </div>
            </section>

            {formError && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {formError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeCreateForm}
                disabled={saving}
                className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-10 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? createdStudentId
                    ? program === 'REGULAR' ? 'Memasukkan ke Kelas...' : 'Mengaktifkan Paket...'
                    : 'Menyimpan...'
                  : createdStudentId
                    ? program === 'REGULAR' ? 'Coba Lagi Masukkan Kelas' : 'Coba Lagi Aktifkan Paket'
                    : 'Simpan Siswa'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {pkgStudent && (
        <Modal title={`Kelola Paket Privat — ${pkgStudent.name}`} onClose={() => { setPkgStudent(null); setPackageConfirm(null); }}>
          {pkgLoading ? (
            <p className="text-sm text-gray-400">Memuat...</p>
          ) : (
            <>
              {pkgError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">
                  {pkgError}
                </p>
              )}

              {activePackage ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold text-gray-900">Sisa Pertemuan</span><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${activePackage.quotaRemaining === 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{activePackage.quotaRemaining === 0 ? 'Habis' : (PACKAGE_STATUS_LABELS[activePackage.status] ?? activePackage.status)}</span></div>
                    <p className="text-2xl font-semibold text-navy-900">{activePackage.quotaRemaining} <span className="text-sm font-normal text-gray-500">/ {activePackage.quotaTotal}</span></p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full bg-navy-700" style={{ width: `${Math.max(0, Math.min(100, (activePackage.quotaRemaining / activePackage.quotaTotal) * 100))}%` }} /></div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs"><p className="text-gray-600">Digunakan:<br /><strong className="text-gray-900">{activePackage.quotaUsed} pertemuan</strong></p><p className="text-gray-600">Sisa:<br /><strong className="text-gray-900">{activePackage.quotaRemaining} pertemuan</strong></p></div>
                  </div>
                  {packageConfirm === 'EXTEND' ? (
                    <div className="rounded-lg border border-navy-200 bg-navy-50 p-3 text-sm text-navy-900"><p className="font-semibold">Tambah Pertemuan Privat?</p><p className="mt-1 text-xs">{pkgStudent.name} akan mendapatkan tambahan 24 pertemuan.</p><p className="mt-2 text-xs">Sisa saat ini: <strong>{activePackage.quotaRemaining}</strong><br />Setelah ditambahkan: <strong>{activePackage.quotaRemaining + 24}</strong></p><div className="mt-3 flex justify-end gap-2"><button onClick={() => setPackageConfirm(null)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs">Batal</button><button onClick={() => extendActivePackage(activePackage.id)} disabled={pkgBusy} className="rounded-md bg-navy-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">{pkgBusy ? 'Memproses...' : 'Tambah 24 Pertemuan'}</button></div></div>
                  ) : <button onClick={() => setPackageConfirm('EXTEND')} className="w-full rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800">+ Tambah 24 Pertemuan</button>}
                </div>
              ) : (
                <div className="space-y-4"><p className="text-sm text-gray-500">Belum ada paket privat aktif untuk siswa ini.</p><div className="rounded-xl border border-gray-200 bg-slate-50 p-4"><p className="font-semibold text-gray-900">Paket Privat</p><p className="mt-1 text-lg font-semibold text-navy-900">24 Pertemuan</p><p className="mt-2 text-xs leading-5 text-gray-600">Aktifkan paket awal untuk memberikan 24 sesi privat kepada siswa.</p></div>{packageConfirm === 'ACTIVATE' ? <div className="rounded-lg border border-navy-200 bg-navy-50 p-3 text-sm text-navy-900"><p className="font-semibold">Aktifkan Paket Privat?</p><p className="mt-1 text-xs">{pkgStudent.name} akan mendapatkan 24 pertemuan privat.</p><div className="mt-3 flex justify-end gap-2"><button onClick={() => setPackageConfirm(null)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs">Batal</button><button onClick={activatePackage} disabled={pkgBusy} className="rounded-md bg-navy-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">{pkgBusy ? 'Memproses...' : 'Aktifkan 24 Pertemuan'}</button></div></div> : <button onClick={() => setPackageConfirm('ACTIVATE')} className="w-full rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800">Aktifkan Paket 24 Pertemuan</button>}</div>
              )}

              {packages.length > 0 && <div className="mt-5 border-t border-gray-200 pt-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Riwayat Paket</p><ul className="space-y-2">{packages.map((p) => <li key={p.id} className="text-xs text-gray-600"><strong className="text-gray-800">{p.packageName || 'Paket Privat'}</strong> · {p.quotaTotal} pertemuan · aktif sejak {formatDate(p.activationDate)}</li>)}</ul></div>}
            </>
          )}
        </Modal>
      )}

      {editingStudent && (
        <Modal title="Edit Siswa" onClose={() => !editSaving && setEditingStudent(null)} className="max-w-xl">
          <form onSubmit={saveEdit} className="space-y-5">
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Informasi Siswa</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2 text-xs font-medium text-gray-700">Nama Siswa<input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} disabled={editSaving} className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm font-normal text-gray-900 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100" /></label>
                <label className="text-xs font-medium text-gray-700">Nomor Telepon Siswa <span className="text-red-600">*</span><input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value.replace(/\D/g, '').slice(0, 13) })} inputMode="numeric" maxLength={13} required disabled={editSaving} className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm font-normal text-gray-900 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100" /></label>
                <label className="text-xs font-medium text-gray-700">Nama Orang Tua / Wali<input value={editForm.guardianName} onChange={(e) => setEditForm({ ...editForm, guardianName: e.target.value })} disabled={editSaving} className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm font-normal text-gray-900 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100" /></label>
                <label className="sm:col-span-2 text-xs font-medium text-gray-700">Nomor Telepon Orang Tua / Wali<input value={editForm.guardianPhone} onChange={(e) => setEditForm({ ...editForm, guardianPhone: e.target.value.replace(/\D/g, '') })} inputMode="numeric" disabled={editSaving} className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm font-normal text-gray-900 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100" /></label>
              </div>
            </section>
            {editError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{editError}</p>}
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4"><button type="button" onClick={() => setEditingStudent(null)} disabled={editSaving} className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700">Batal</button><button type="submit" disabled={editSaving} className="h-10 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white disabled:opacity-60">{editSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</button></div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Hapus Siswa Permanen?" onClose={() => { setDeleteTarget(null); setDeleteAcknowledged(false); }}>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm leading-6 text-red-900">Data siswa &quot;{deleteTarget.name}&quot; akan dihapus secara permanen dari sistem.</p>
            <p className="mt-2 text-sm leading-6 text-red-800">Data terkait seperti program, paket privat, jadwal privat, dan riwayat pembelajaran terkait juga dapat ikut terhapus.</p>
            <p className="mt-2 text-sm font-semibold text-red-900">Tindakan ini tidak dapat dibatalkan.</p>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-gray-700"><input type="checkbox" checked={deleteAcknowledged} onChange={(event) => setDeleteAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500" /><span>Saya memahami bahwa data yang dihapus tidak dapat dikembalikan.</span></label>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => { setDeleteTarget(null); setDeleteAcknowledged(false); }} disabled={busyId === deleteTarget.id} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700">Batal</button>
            <button onClick={deleteStudent} disabled={!deleteAcknowledged || busyId === deleteTarget.id} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">{busyId === deleteTarget.id ? 'Menghapus...' : 'Hapus Permanen'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
