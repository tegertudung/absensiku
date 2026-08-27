'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import Modal from '@/components/Modal';
import { formatRupiah, formatDate } from '@/lib/format';

interface HonorRate {
  id: string;
  sessionType: string;
  nominal: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
}

export default function AdminHonorRatesPage() {
  const [rates, setRates] = useState<HonorRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [form, setForm] = useState({ sessionType: 'REGULAR', nominal: '', effectiveFrom: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/honor-rates');
      setRates(res.data.data);
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

    const nominalNum = Number(form.nominal);
    if (!nominalNum || nominalNum <= 0) {
      setFormError('Nominal harus lebih dari 0');
      return;
    }
    if (!form.effectiveFrom) {
      setFormError('Tanggal mulai berlaku wajib diisi');
      return;
    }

    setSaving(true);
    try {
      await api.post('/honor-rates', {
        sessionType: form.sessionType,
        nominal: nominalNum,
        effectiveFrom: form.effectiveFrom,
        notes: form.notes || undefined,
      });
      setShowForm(false);
      setForm({ sessionType: 'REGULAR', nominal: '', effectiveFrom: '', notes: '' });
      await load();
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Gagal menyimpan tarif');
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(rate: HonorRate) {
    if (!confirm(`Nonaktifkan tarif ${formatRupiah(rate.nominal)} (${rate.sessionType})?`)) return;
    setBusyId(rate.id);
    try {
      await api.patch(`/honor-rates/${rate.id}/deactivate`);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Master Honor</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md bg-navy-900 text-white text-sm font-medium px-4 py-2 hover:bg-navy-800"
        >
          + Tambah Tarif
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Menambah tarif baru akan otomatis menutup tarif lama yang sedang berjalan (tidak menimpa histori).
      </p>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Jenis</th>
              <th className="px-4 py-3 font-medium">Nominal</th>
              <th className="px-4 py-3 font-medium">Berlaku Dari</th>
              <th className="px-4 py-3 font-medium">Berlaku Sampai</th>
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
            ) : rates.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Belum ada tarif honor.
                </td>
              </tr>
            ) : (
              rates.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-900">
                    {r.sessionType === 'REGULAR' ? 'Reguler' : 'Privat'}
                  </td>
                  <td className="px-4 py-3 text-gray-900 font-medium">{formatRupiah(r.nominal)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(r.effectiveFrom)}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.effectiveTo ? formatDate(r.effectiveTo) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        r.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {r.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.status === 'ACTIVE' && !r.effectiveTo && (
                      <button
                        onClick={() => deactivate(r)}
                        disabled={busyId === r.id}
                        className="text-xs font-medium text-red-600 disabled:opacity-60"
                      >
                        {busyId === r.id ? '...' : 'Nonaktifkan'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Tambah Tarif Honor" onClose={() => setShowForm(false)}>
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
              <label className="block text-xs font-medium text-gray-700 mb-1">Nominal (Rp)</label>
              <input
                type="number"
                value={form.nominal}
                onChange={(e) => setForm({ ...form, nominal: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="100000"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Berlaku Mulai</label>
              <input
                type="date"
                value={form.effectiveFrom}
                onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Catatan (opsional)</label>
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
    </div>
  );
}
