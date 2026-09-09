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

type PreviewRow = Record<string, unknown> & {
  rowNumber: number;
  errors: string[];
};
type CommitResult = {
  created: number;
  restored?: number;
  alreadyActive?: number;
  failed?: number;
  failures: Array<{ rowNumber: number; message: string }>;
  credentials?: Array<{
    name?: string;
    email: string;
    status?: "CREATED" | "RESTORED";
    temporaryPassword: string;
  }>;
  results?: Array<{
    rowNumber: number;
    name: string;
    email: string;
    status: "CREATED" | "RESTORED" | "ALREADY_ACTIVE" | "FAILED";
    message?: string;
  }>;
};

const statusLabel = {
  CREATED: "Dibuat",
  RESTORED: "Dipulihkan",
  ALREADY_ACTIVE: "Sudah aktif",
  FAILED: "Gagal",
} as const;

function csvCell(value: string) {
  const formulaSafe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

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

  function downloadCredentials() {
    if (!result?.credentials?.length) return;
    const rows = [
      ["Nama", "Email", "Temporary Password", "Status"],
      ...result.credentials.map((credential) => [
        credential.name || "",
        credential.email,
        credential.temporaryPassword,
        credential.status || "CREATED",
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "kredensial-tentor.csv";
    anchor.click();
    URL.revokeObjectURL(url);
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
                      <td className="px-3 py-2 text-gray-500">
                        {row.rowNumber}
                      </td>
                      {columns.map((column) => (
                        <td key={column.key} className="px-3 py-2">
                          {cellText(row[column.key])}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        {row.errors.length === 0 ? (
                          <span className="font-medium text-emerald-700">
                            Valid
                          </span>
                        ) : (
                          <span className="text-red-700">
                            {row.errors.join(" ")}
                          </span>
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
            {result.results ? (
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <ResultCount label="Dibuat" value={result.created} />
                <ResultCount label="Dipulihkan" value={result.restored || 0} />
                <ResultCount
                  label="Sudah aktif"
                  value={result.alreadyActive || 0}
                />
                <ResultCount
                  label="Gagal"
                  value={result.failed ?? result.failures.length}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {result.created} data berhasil diimpor.
              </div>
            )}
            {result.results && (
              <div className="max-h-52 overflow-auto rounded-lg border border-gray-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Baris</th>
                      <th className="px-3 py-2">Nama</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((row) => (
                      <tr key={row.rowNumber} className="border-t">
                        <td className="px-3 py-2">{row.rowNumber}</td>
                        <td className="px-3 py-2">{row.name || "-"}</td>
                        <td className="px-3 py-2">{row.email || "-"}</td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              row.status === "FAILED"
                                ? "text-red-700"
                                : row.status === "ALREADY_ACTIVE"
                                  ? "text-gray-600"
                                  : "font-medium text-emerald-700"
                            }
                          >
                            {statusLabel[row.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.failures.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <p className="font-medium">
                  {result.failures.length} baris gagal:
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                  {result.failures.map((failure) => (
                    <li key={failure.rowNumber}>
                      Baris {failure.rowNumber}: {failure.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.credentials && result.credentials.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                <p className="font-semibold">
                  Password sementara — tampil sekali
                </p>
                <p className="mt-1 text-xs">
                  Password sementara hanya tersedia pada hasil import ini.
                  Simpan dan bagikan kepada Tentor secara aman.
                </p>
                <button
                  type="button"
                  onClick={downloadCredentials}
                  className="mt-3 rounded-lg bg-amber-900 px-3 py-2 text-xs font-medium text-white"
                >
                  Unduh Kredensial
                </button>
                <div className="mt-3 max-h-48 space-y-2 overflow-auto">
                  {result.credentials.map((credential) => (
                    <div
                      key={credential.email}
                      className="rounded border border-amber-200 bg-white px-3 py-2 font-mono text-xs"
                    >
                      {credential.name && <p>{credential.name}</p>}
                      <p className="break-all">{credential.email}</p>
                      <p className="mt-1 break-all font-semibold">
                        {credential.temporaryPassword}
                      </p>
                      {credential.status && (
                        <p className="mt-1 font-sans text-amber-700">
                          {statusLabel[credential.status]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
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

function ResultCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-lg font-semibold text-navy-900">{value}</p>
      <p className="text-xs text-gray-600">{label}</p>
    </div>
  );
}
