'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';

interface AuditLogEntry {
  id: string;
  tableName: string;
  recordId: string;
  action: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  changedBy: string | null;
  changedByEmail: string | null;
  changedAt: string;
  reason: string | null;
}

const TABLE_LABELS: Record<string, string> = {
  teaching_sessions: 'Sesi Mengajar',
  tutors: 'Tentor',
  students: 'Siswa',
  private_packages: 'Paket Privat',
  schedules: 'Jadwal',
};

function formatValues(values: Record<string, unknown> | null): string {
  if (!values) return '-';
  return Object.entries(values)
    .map(([k, v]) => `${k}: ${v ?? '-'}`)
    .join(', ');
}

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/audit-logs', {
        params: tableFilter ? { tableName: tableFilter } : undefined,
      });
      setLogs(res.data.data);
    } finally {
      setLoading(false);
    }
  }, [tableFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Audit Log</h1>
      <p className="text-sm text-gray-500 mb-6">
        Jejak perubahan data penting oleh admin — siapa, kapan, nilai lama, dan nilai baru (BR-13).
      </p>

      <div className="mb-4">
        <select
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Semua data</option>
          {Object.entries(TABLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Waktu</th>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium">Diubah Oleh</th>
              <th className="px-4 py-3 font-medium">Nilai Lama</th>
              <th className="px-4 py-3 font-medium">Nilai Baru</th>
              <th className="px-4 py-3 font-medium">Alasan</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Memuat...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Belum ada perubahan tercatat.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-100 last:border-0 align-top">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(log.changedAt).toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {TABLE_LABELS[log.tableName] ?? log.tableName}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{log.changedByEmail ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-[180px]">
                    {formatValues(log.oldValues)}
                  </td>
                  <td className="px-4 py-3 text-gray-900 text-xs max-w-[180px]">
                    {formatValues(log.newValues)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-[220px]">{log.reason ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
