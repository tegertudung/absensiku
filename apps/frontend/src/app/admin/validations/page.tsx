'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import Modal from '@/components/Modal';
import { formatDate, SESSION_TYPE_LABELS } from '@/lib/format';

interface ValidationItem {
  id: string;
  sessionId: string;
  caseType: string;
  decision: string;
  description: string;
  createdAt: string;
  session: {
    sessionDate: string;
    sessionType: string;
    tutor: { name: string };
    class: { name: string } | null;
    student: { name: string } | null;
  };
}

const CASE_TYPE_LABELS: Record<string, string> = {
  CANCELLATION_DAY_OF: 'Pembatalan Hari-H',
  OVERDUE_COMPLETION: 'Lewat Batas Waktu Input',
  MANUAL_CORRECTION: 'Koreksi Manual',
  DISPUTE: 'Perselisihan',
};

export default function AdminValidationsPage() {
  const [validations, setValidations] = useState<ValidationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decideTarget, setDecideTarget] = useState<{ id: string; decision: 'APPROVED' | 'REJECTED' } | null>(
    null
  );
  const [adminNotes, setAdminNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/sessions/validations/pending');
      setValidations(res.data.data);
    } catch {
      setError('Gagal memuat data validasi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openDecide(id: string, decision: 'APPROVED' | 'REJECTED') {
    setError(null);
    setAdminNotes('');
    setDecideTarget({ id, decision });
  }

  async function submitDecision() {
    if (!decideTarget) return;
    setBusyId(decideTarget.id);
    setError(null);
    try {
      await api.post(`/sessions/validations/${decideTarget.id}/decide`, {
        decision: decideTarget.decision,
        adminNotes: adminNotes.trim() || undefined,
      });
      setDecideTarget(null);
      setAdminNotes('');
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Gagal menyimpan keputusan.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Validasi</h1>
      <p className="text-sm text-gray-500 mb-6">
        Kasus pembatalan hari-H, keterlambatan input, dan koreksi khusus yang menunggu keputusan Anda.
      </p>

      {error && !decideTarget && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Memuat...</p>
      ) : validations.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">Tidak ada kasus yang menunggu validasi. 🎉</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {validations.map((v) => (
            <li key={v.id} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    {CASE_TYPE_LABELS[v.caseType] ?? v.caseType}
                  </span>
                  <p className="text-sm font-medium text-gray-900 mt-2">
                    {v.session.tutor.name} &middot; {SESSION_TYPE_LABELS[v.session.sessionType]}
                  </p>
                  <p className="text-xs text-gray-500">
                    {v.session.sessionType === 'REGULAR' ? v.session.class?.name : v.session.student?.name}{' '}
                    &middot; {formatDate(v.session.sessionDate)}
                  </p>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  Dilaporkan {formatDate(v.createdAt)}
                </span>
              </div>

              <p className="text-sm text-gray-700 bg-gray-50 rounded-md px-3 py-2 mb-3">{v.description}</p>

              <div className="flex gap-2">
                <button
                  onClick={() => openDecide(v.id, 'APPROVED')}
                  disabled={busyId === v.id}
                  className="flex-1 text-xs font-medium text-white bg-green-600 rounded-md py-2 hover:bg-green-700 disabled:opacity-60"
                >
                  Setujui (Tetap Dihitung)
                </button>
                <button
                  onClick={() => openDecide(v.id, 'REJECTED')}
                  disabled={busyId === v.id}
                  className="flex-1 text-xs font-medium text-red-600 border border-red-200 rounded-md py-2 hover:bg-red-50 disabled:opacity-60"
                >
                  Tolak (Tidak Dihitung)
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {decideTarget && (
        <Modal
          title={decideTarget.decision === 'APPROVED' ? 'Setujui Kasus' : 'Tolak Kasus'}
          onClose={() => setDecideTarget(null)}
        >
          <p className="text-xs text-gray-500 mb-3">
            {decideTarget.decision === 'APPROVED'
              ? 'Sesi akan tetap dihitung: honor dicatat dan kuota paket privat (jika ada) akan berkurang.'
              : 'Sesi tidak akan dihitung: tidak ada honor dan kuota paket tidak berkurang.'}
          </p>
          <label className="block text-xs font-medium text-gray-700 mb-1">Catatan Admin (opsional)</label>
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-3"
            placeholder="Contoh: Dikonfirmasi via WA orang tua"
          />

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={submitDecision}
              disabled={busyId === decideTarget.id}
              className={`flex-1 text-xs font-medium text-white rounded-md py-2 disabled:opacity-60 ${
                decideTarget.decision === 'APPROVED' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {busyId === decideTarget.id ? 'Memproses...' : 'Konfirmasi'}
            </button>
            <button
              onClick={() => setDecideTarget(null)}
              className="flex-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-md py-2"
            >
              Batal
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
