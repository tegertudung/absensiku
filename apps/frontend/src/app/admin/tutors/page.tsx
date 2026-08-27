'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import Modal from '@/components/Modal';

interface Tutor {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  user: { email: string; isActive: boolean; lastLogin: string | null };
}

export default function AdminTutorsPage() {
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/tutors');
      setTutors(res.data.data);
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

    if (!form.name || !form.email || form.password.length < 6) {
      setFormError('Nama, email wajib diisi; password minimal 6 karakter');
      return;
    }

    setSaving(true);
    try {
      await api.post('/tutors', form);
      setShowForm(false);
      setForm({ name: '', email: '', password: '', phone: '' });
      await load();
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Gagal menambah tentor');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(tutor: Tutor) {
    setBusyId(tutor.id);
    try {
      const action = tutor.status === 'ACTIVE' ? 'deactivate' : 'activate';
      await api.patch(`/tutors/${tutor.id}/${action}`);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Data Tentor</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md bg-blue-600 text-white text-sm font-medium px-4 py-2 hover:bg-blue-700"
        >
          + Tambah Tentor
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Nama</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Telepon</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Login Terakhir</th>
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
            ) : tutors.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Belum ada data tentor.
                </td>
              </tr>
            ) : (
              tutors.map((t) => (
                <tr key={t.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-900">
                    <Link href={`/admin/tutors/${t.id}`} className="text-blue-600 hover:underline">
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{t.user.email}</td>
                  <td className="px-4 py-3 text-gray-600">{t.phone || '-'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        t.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {t.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {t.user.lastLogin ? new Date(t.user.lastLogin).toLocaleString('id-ID') : 'Belum pernah'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(t)}
                      disabled={busyId === t.id}
                      className={`text-xs font-medium disabled:opacity-60 ${
                        t.status === 'ACTIVE' ? 'text-red-600' : 'text-green-600'
                      }`}
                    >
                      {busyId === t.id ? '...' : t.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Tambah Tentor" onClose={() => setShowForm(false)}>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nama</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Minimal 6 karakter"
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
