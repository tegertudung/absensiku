'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatDate } from '@/lib/format';

interface Quota {
  quotaTotal: number;
  quotaUsed: number;
  quotaRemaining: number;
}

interface Program {
  type: 'REGULAR' | 'PRIVATE';
  label: string;
  quotaTotal: number;
  quotaUsed: number;
  quotaRemaining: number;
}

interface ChildSummary {
  relationship: string | null;
  student: { id: string; name: string; status: string; programs: Program[] };
}

interface PrivateSessionRow {
  id: string;
  sessionDate: string;
  tutorName: string;
  subjectName: string | null;
  material: string | null;
  progressNotes: string | null;
  score: string | number | null;
}

interface AttendanceRow {
  id: string;
  sessionDate: string;
  className: string | null;
  subjectName: string | null;
  tutorName: string;
  material: string | null;
  attendanceStatus: string;
}

interface ChildProgress {
  privateSessions: PrivateSessionRow[];
  regularAttendance: AttendanceRow[];
}

const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENT: 'Hadir',
  ABSENT: 'Tidak Hadir',
  LATE: 'Terlambat',
  EXCUSED: 'Izin',
};

const ATTENDANCE_STYLE: Record<string, string> = {
  PRESENT: 'bg-green-100 text-green-700',
  ABSENT: 'bg-red-50 text-red-600',
  LATE: 'bg-amber-100 text-amber-700',
  EXCUSED: 'bg-blue-50 text-blue-700',
};

export default function ParentHomePage() {
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ChildProgress | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api
      .get('/parent/children')
      .then((res) => {
        setChildren(res.data.data);
        if (res.data.data.length > 0) setSelectedId(res.data.data[0].student.id);
      })
      .catch(() => setError('Gagal memuat data anak.'))
      .finally(() => setLoadingChildren(false));
  }, []);

  const loadProgress = useCallback(async (studentId: string) => {
    setLoadingProgress(true);
    try {
      const res = await api.get(`/parent/children/${studentId}/progress`);
      setProgress(res.data.data);
    } catch {
      setError('Gagal memuat progress anak.');
    } finally {
      setLoadingProgress(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadProgress(selectedId);
  }, [selectedId, loadProgress]);

  // Declared before handleDownload (which closes over it) so it's never
  // referenced ahead of its own initialization within the component body.
  const selected = children.find((c) => c.student.id === selectedId) ?? children[0];

  async function handleDownload() {
    if (!selectedId) return;
    setDownloading(true);
    try {
      const res = await api.get(`/parent/children/${selectedId}/report.pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `laporan-${selected?.student.name || 'siswa'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Gagal mengunduh laporan.');
    } finally {
      setDownloading(false);
    }
  }

  if (loadingChildren) return <p className="text-sm text-gray-400">Memuat...</p>;
  if (error && children.length === 0) return <p className="text-sm text-red-600">{error}</p>;
  if (children.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center">
        <p className="text-sm text-gray-400">Belum ada anak yang terhubung ke akun Anda. Hubungi Admin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

      {children.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {children.map((c) => (
            <button
              key={c.student.id}
              onClick={() => setSelectedId(c.student.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
                selectedId === c.student.id ? 'bg-navy-900 text-white' : 'bg-white border border-gray-200 text-gray-600'
              }`}
            >
              {c.student.name}
            </button>
          ))}
        </div>
      )}

      {/* Ringkasan anak + kuota */}
      <div className="rounded-2xl bg-navy-900 p-5 text-white">
        <p className="text-sm text-navy-200">Anak Anda</p>
        <p className="mt-0.5 text-lg font-semibold">{selected.student.name}</p>
        {selected.relationship && <p className="text-xs text-navy-300">{selected.relationship}</p>}

        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          {selected.student.programs.length === 0 ? (
            <p className="text-xs text-navy-200">Belum ada program aktif.</p>
          ) : (
            selected.student.programs.map((p, i) => {
              const pct = p.quotaTotal ? Math.max(0, Math.min(100, (p.quotaRemaining / p.quotaTotal) * 100)) : 0;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-navy-200">{p.type === 'REGULAR' ? 'Reguler' : 'Privat'} — {p.label}</span>
                    <span className="font-medium">{p.quotaRemaining} / {p.quotaTotal} sesi</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15">
                    <div className="h-full bg-white" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <button
        onClick={handleDownload}
        disabled={downloading}
        className="w-full rounded-lg border border-navy-200 bg-white py-2.5 text-sm font-medium text-navy-900 disabled:opacity-60"
      >
        {downloading ? 'Menyiapkan...' : '⬇ Unduh Laporan Progress (PDF)'}
      </button>

      {loadingProgress ? (
        <p className="text-sm text-gray-400">Memuat progress...</p>
      ) : (
        <>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Progress Belajar</h2>
            {!progress || progress.privateSessions.length === 0 ? (
              <p className="text-sm text-gray-400">Belum ada riwayat sesi privat.</p>
            ) : (
              <div className="space-y-2">
                {progress.privateSessions.map((s) => (
                  <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{s.subjectName || 'Tanpa Mapel'}</p>
                        <p className="text-xs text-gray-500">
                          {formatDate(s.sessionDate)} &middot; {s.tutorName}
                        </p>
                      </div>
                      {s.score != null && (
                        <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-semibold text-navy-800">
                          Nilai {s.score}
                        </span>
                      )}
                    </div>
                    {s.material && <p className="mt-2 text-xs text-gray-600">Materi: {s.material}</p>}
                    {s.progressNotes && <p className="mt-1 text-xs text-gray-500">Catatan: {s.progressNotes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Kehadiran (Kelas Reguler)</h2>
            {!progress || progress.regularAttendance.length === 0 ? (
              <p className="text-sm text-gray-400">Belum ada riwayat kehadiran.</p>
            ) : (
              <div className="space-y-2">
                {progress.regularAttendance.map((a) => (
                  <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-3.5 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{a.className}</p>
                      <p className="text-xs text-gray-500">
                        {formatDate(a.sessionDate)} &middot; {a.subjectName} &middot; {a.tutorName}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${ATTENDANCE_STYLE[a.attendanceStatus] || 'bg-gray-100 text-gray-600'}`}>
                      {ATTENDANCE_LABELS[a.attendanceStatus] || a.attendanceStatus}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
