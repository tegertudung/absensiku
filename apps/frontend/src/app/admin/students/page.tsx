'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import Modal from '@/components/Modal';
import { formatDate } from '@/lib/format';

interface Student {
  id: string;
  name: string;
  phone: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  status: string;
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
  const [busyId, setBusyId] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', phone: '', guardianName: '', guardianPhone: '' });

  const [pkgStudent, setPkgStudent] = useState<Student | null>(null);
  const [packages, setPackages] = useState<PrivatePackage[]>([]);
  const [pkgLoading, setPkgLoading] = useState(false);
  const [pkgError, setPkgError] = useState<string | null>(null);
  const [pkgBusy, setPkgBusy] = useState(false);
  const [newQuota, setNewQuota] = useState('24');
  const [extendQuota, setExtendQuota] = useState('12');

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.name || form.name.trim().length < 2) {
      setFormError('Nama siswa minimal 2 karakter');
      return;
    }

    setSaving(true);
    try {
      await api.post('/students', form);
      setShowForm(false);
      setForm({ name: '', phone: '', guardianName: '', guardianPhone: '' });
      await load();
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
    const quota = Number(newQuota);
    if (!quota || quota <= 0) {
      setPkgError('Kuota harus lebih dari 0');
      return;
    }
    setPkgBusy(true);
    setPkgError(null);
    try {
      await api.post('/private-packages', { studentId: pkgStudent.id, quotaTotal: quota });
      await refreshPackages();
    } catch (err: any) {
      setPkgError(err.response?.data?.message || 'Gagal mengaktifkan paket');
    } finally {
      setPkgBusy(false);
    }
  }

  async function extendActivePackage(pkgId: string) {
    const additional = Number(extendQuota);
    if (!additional || additional <= 0) {
      setPkgError('Jumlah tambahan harus lebih dari 0');
      return;
    }
    setPkgBusy(true);
    setPkgError(null);
    try {
      await api.post(`/private-packages/${pkgId}/extend`, { additionalQuota: additional });
      await refreshPackages();
    } catch (err: any) {
      setPkgError(err.response?.data?.message || 'Gagal menambah kuota');
    } finally {
      setPkgBusy(false);
    }
  }

  const activePackage = packages.find((p) => p.status === 'ACTIVE');

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Data Siswa</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md bg-navy-900 text-white text-sm font-medium px-4 py-2 hover:bg-navy-800"
        >
          + Tambah Siswa
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Nama</th>
              <th className="px-4 py-3 font-medium">Telepon</th>
              <th className="px-4 py-3 font-medium">Orang Tua/Wali</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Paket Privat</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  Memuat...
                </td>
              </tr>
            ) : students.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  Belum ada data siswa.
                </td>
              </tr>
            ) : (
              students.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-900">
                    <Link href={`/admin/students/${s.id}`} className="text-blue-600 hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.phone || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.guardianName ? `${s.guardianName} (${s.guardianPhone || '-'})` : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={s.status}
                      disabled={busyId === s.id}
                      onChange={(e) => changeStatus(s, e.target.value)}
                      className="text-xs rounded-md border border-gray-300 px-2 py-1 disabled:opacity-60"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {STATUS_LABELS[opt]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openPackages(s)} className="text-xs font-medium text-blue-600">
                      Kelola Paket
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Tambah Siswa" onClose={() => setShowForm(false)}>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nama Siswa</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Telepon (opsional)</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nama Orang Tua/Wali</label>
              <input
                value={form.guardianName}
                onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Telepon Orang Tua/Wali</label>
              <input
                value={form.guardianPhone}
                onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })}
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
              className="w-full rounded-md bg-navy-900 text-white text-sm font-medium py-2 hover:bg-navy-800 disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </form>
        </Modal>
      )}

      {pkgStudent && (
        <Modal title={`Paket Privat - ${pkgStudent.name}`} onClose={() => setPkgStudent(null)}>
          {pkgLoading ? (
            <p className="text-sm text-gray-400">Memuat...</p>
          ) : (
            <>
              {packages.length === 0 ? (
                <p className="text-sm text-gray-400 mb-4">Belum ada paket privat untuk siswa ini.</p>
              ) : (
                <ul className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                  {packages.map((p) => (
                    <li key={p.id} className="border border-gray-200 rounded-md p-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-900">
                          {p.packageName || 'Paket Privat'}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            p.status === 'ACTIVE'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {PACKAGE_STATUS_LABELS[p.status] ?? p.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Sisa {p.quotaRemaining} / {p.quotaTotal} sesi &middot; Aktif sejak{' '}
                        {formatDate(p.activationDate)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {pkgError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">
                  {pkgError}
                </p>
              )}

              {activePackage ? (
                <div className="border-t border-gray-200 pt-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Tambah Kuota ke Paket Aktif
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={extendQuota}
                      onChange={(e) => setExtendQuota(e.target.value)}
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => extendActivePackage(activePackage.id)}
                      disabled={pkgBusy}
                      className="rounded-md bg-navy-900 text-white text-sm font-medium px-4 py-2 hover:bg-navy-800 disabled:opacity-60"
                    >
                      {pkgBusy ? '...' : 'Tambah'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-gray-200 pt-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Aktifkan Paket Baru (Kuota Sesi)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={newQuota}
                      onChange={(e) => setNewQuota(e.target.value)}
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                    <button
                      onClick={activatePackage}
                      disabled={pkgBusy}
                      className="rounded-md bg-navy-900 text-white text-sm font-medium px-4 py-2 hover:bg-navy-800 disabled:opacity-60"
                    >
                      {pkgBusy ? '...' : 'Aktifkan'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
