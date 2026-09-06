"use client";

import { useRef, useState } from "react";
import Modal from "@/components/Modal";
import api, { errorMessage } from "@/lib/api";

export interface ImportColumn {
  key: string;
  label: string;
}

export interface ImportModalProps {
  title: string;
  /** Shown above the file picker, e.g. the expected column names. */
  instructions: string;
  columns: ImportColumn[];
  previewUrl: string;
  commitUrl: string;
  onClose: () => void;
  /** Called after a successful (partial or full) commit so the list can reload. */
  onImported: () => void;
}

type PreviewRow = Record<string, unknown> & { rowNumber: number; errors: string[] };
type CommitResult = { created: number; failures: Array<{ rowNumber: number; message: string }> };

function cellText(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "-";
  return String(value);
}

/**
 * Generic two-step Excel import flow shared by Tentor and Siswa: pick a
 * .xlsx, upload it for validation (nothing is saved yet), review every row
 * with its per-row errors highlighted, then commit only the rows that
 * passed. Column shape is fully driven by `columns` so this one component
 * covers both without knowing about tutors/students specifically.
 */
export default function ImportModal({
  title,
  instructions,
  columns,
  previewUrl,
  commitUrl,
  onClose,
  onImported,
}: ImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CommitResult | null>(null);

  const validRows = rows?.filter((row) => row.errors.length === 0) ?? [];
  const invalidRows = rows?.filter((row) => row.errors.length > 0) ?? [];

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setResult(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      // No explicit Content-Type here — axios must generate the multipart
      // boundary itself from the FormData body; setting the header manually
      // would pin it to a boundary-less value and the backend's parser
      // (which reads the boundary from this exact header) would reject it.
      const response = await api.post(previewUrl, formData);
      setRows(response.data.data.rows);
    } catch (cause) {
      setError(errorMessage(cause, "Gagal membaca file."));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function commit() {
    if (validRows.length === 0) return;
    setCommitting(true);
    setError("");
    try {
      const response = await api.post(commitUrl, { rows: validRows });
      setResult(response.data.data);
      onImported();
    } catch (cause) {
      setError(errorMessage(cause, "Gagal mengimpor data."));
    } finally {
      setCommitting(false);
    }
  }

  function reset() {
    setRows(null);
    setResult(null);
    setError("");
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        {!rows && (
          <>
            <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              {instructions}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              disabled={uploading}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-navy-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-navy-800"
            />
            {uploading && (
              <p className="text-sm text-gray-500">Membaca file...</p>
            )}
          </>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {rows && !result && (
          <>
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-emerald-700">
                {validRows.length} baris valid
              </span>{" "}
              siap diimpor
              {invalidRows.length > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <span className="font-semibold text-red-700">
                    {invalidRows.length} baris bermasalah
                  </span>{" "}
                  (akan dilewati — perbaiki di file lalu unggah ulang bila
                  perlu)
                </>
              )}
              .
            </p>
            <div className="max-h-72 overflow-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Baris</th>
                    {columns.map((column) => (
                      <th key={column.key} className="px-3 py-2">
                        {column.label}
                      </th>
                    ))}
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.rowNumber}
                      className={`border-t border-gray-100 ${row.errors.length > 0 ? "bg-red-50" : ""}`}
                    >
                      <td className="px-3 py-2 text-gray-500">{row.rowNumber}</td>
                      {columns.map((column) => (
                        <td key={column.key} className="px-3 py-2">
                          {cellText(row[column.key])}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        {row.errors.length === 0 ? (
                          <span className="font-medium text-emerald-700">Valid</span>
                        ) : (
                          <span className="text-red-700">{row.errors.join(" ")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={reset}
                disabled={committing}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Unggah Ulang
              </button>
              <button
                type="button"
                onClick={commit}
                disabled={committing || validRows.length === 0}
                className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {committing
                  ? "Mengimpor..."
                  : `Impor ${validRows.length} Data Valid`}
              </button>
            </div>
          </>
        )}

        {result && (
          <>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {result.created} data berhasil diimpor.
            </div>
            {result.failures.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <p className="font-medium">{result.failures.length} baris gagal:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                  {result.failures.map((failure) => (
                    <li key={failure.rowNumber}>
                      Baris {failure.rowNumber}: {failure.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end border-t pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white"
              >
                Selesai
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
