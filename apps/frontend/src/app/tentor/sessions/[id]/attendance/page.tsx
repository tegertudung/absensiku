'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';

interface RosterEntry {
  studentId: string;
  studentName: string;
  status: string | null;
  notes: string | null;
}

const STATUS_OPTIONS: Array<{ value: 'PRESENT' | 'LATE' | 'EXCUSED' | 'ABSENT'; label: string }> = [
  { value: 'PRESENT', label: 'Hadir' },
  { value: 'LATE', label: 'Telat' },
  { value: 'EXCUSED', label: 'Izin' },
  { value: 'ABSENT', label: 'Alpa' },
];

const STATUS_COLORS: Record<string, string> = {
  PRESENT: 'bg-green-600 text-white border-green-600',
  LATE: 'bg-amber-500 text-white border-amber-500',
  EXCUSED: 'bg-blue-500 text-white border-blue-500',
  ABSENT: 'bg-red-600 text-white border-red-600',
};

export default function AttendanceFormPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get(`/sessions/${sessionId}/attendance`);
      setRoster(res.data.data);
    } catch (err: any) {
      setLoadError(err.response?.data?.message || 'Gagal memuat data absensi.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  function setStatus(studentId: string, status: string) {
    setSaved(false);
    setRoster((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, status } : r)));
  }

  function setNote(studentId: string, notes: string) {
    setRoster((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, notes } : r)));
  }

  async function handleSubmit() {
    const records = roster
      .filter((r) => r.status)
      .map((r) => ({ studentId: r.studentId, status: r.status!, notes: r.notes || undefined }));

    if (records.length === 0) {
      setSaveError('Pilih status kehadiran untuk minimal 1 siswa.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await api.post(`/sessions/${sessionId}/attendance`, { records });
      setSaved(true);
    } catch (err: any) {
      setSaveError(err.response?.data?.message || 'Gagal menyimpan absensi.');
    } finally {
      setSaving(false);
    }
  }

  const filledCount = roster.filter((r) => r.status).length;

  if (loading) return <p className="text-sm text-gray-400">Memuat absensi...</p>;

  if (loadError) {
    return (
      <div>
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">
          {loadError}
        </p>
        <button onClick={() => router.push('/tentor/schedule')} className="text-xs text-blue-600">
          ← Kembali ke Jadwal
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={() => router.push('/tentor/schedule')} className="text-xs text-blue-600">
        ← Kembali ke Jadwal
      </button>

      <div>
        <h1 className="text-base font-semibold text-gray-900">Absensi Siswa</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          {filledCount} dari {roster.length} siswa sudah diisi
        </p>
      </div>

      {roster.length === 0 ? (
        <p className="text-sm text-gray-400">Belum ada siswa terdaftar di kelas ini.</p>
      ) : (
        <div className="space-y-3">
          {roster.map((r) => (
            <div key={r.studentId} className="bg-white rounded-lg border border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-900 mb-2">{r.studentName}</p>
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStatus(r.studentId, opt.value)}
                    className={`text-xs font-medium rounded-md py-1.5 border ${
                      r.status === opt.value
                        ? STATUS_COLORS[opt.value]
                        : 'bg-white text-gray-600 border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <input
                value={r.notes || ''}
                onChange={(e) => setNote(r.studentId, e.target.value)}
                placeholder="Catatan (opsional)"
                className="w-full text-xs rounded-md border border-gray-300 px-2 py-1.5"
              />
            </div>
          ))}
        </div>
      )}

      {saveError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {saveError}
        </p>
      )}

      {saved && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          Absensi berhasil disimpan.
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={saving || roster.length === 0}
        className="w-full text-sm font-medium text-white bg-navy-900 rounded-md py-2.5 disabled:opacity-60"
      >
        {saving ? 'Menyimpan...' : 'Simpan Absensi'}
      </button>
    </div>
  );
}
