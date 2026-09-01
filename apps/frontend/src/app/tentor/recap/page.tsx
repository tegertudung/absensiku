"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { formatRupiah, formatDate } from "@/lib/format";
import { StatusBadge, TypeBadge } from "@/components/StatusBadge";
import {
  IconCheckCircle,
  IconChevronRight,
  IconClock,
  IconFilter,
  IconSchedule,
  IconX,
} from "@/components/icons";

interface SessionRow {
  id: string;
  sessionDate: string;
  sessionType: string;
  status: string;
  honorRateSnapshot: string | null;
  class: { name: string } | null;
  student: { name: string } | null;
  subject: { name: string } | null;
  startTime?: string | null;
  endTime?: string | null;
}

export default function TentorRecapPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingSlip, setDownloadingSlip] = useState(false);
  const [period, setPeriod] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    sessionType: "",
  });
  const [dateRange, setDateRange] = useState({ startDate: "", endDate: "" });
  const [slipPeriod, setSlipPeriod] = useState({
    month: String(new Date().getMonth() + 1),
    year: String(new Date().getFullYear()),
  });
  const [slipMessage, setSlipMessage] = useState("");

  function buildParams() {
    const params: Record<string, string> = {};
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
    if (filters.sessionType) params.sessionType = filters.sessionType;
    return params;
  }
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/sessions", { params: buildParams() });
      setSessions(res.data.data);
    } finally {
      setLoading(false);
    } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);
  useEffect(() => {
    load();
  }, [load]);

  async function downloadSlip() {
    setDownloadingSlip(true);
    setSlipMessage("");
    try {
      const res = await api.get("/honor/slip.pdf", {
        params: {
          month: Number(slipPeriod.month),
          year: Number(slipPeriod.year),
        },
        responseType: "blob",
      });
      const url = URL.createObjectURL(
        new Blob([res.data], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "slip-honor.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setSlipMessage(
        err.response?.data?.message || "Gagal membuat Slip Honor.",
      );
    } finally {
      setDownloadingSlip(false);
    }
  }
  function selectPeriod(value: string) {
    if (!value) return;
    setPeriod(value);
    const [year, month] = value.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    setFilters((current) => ({
      ...current,
      startDate: `${value}-01`,
      endDate: `${value}-${String(lastDay).padStart(2, "0")}`,
    }));
  }
  function openFilter() {
    setDateRange({ startDate: filters.startDate, endDate: filters.endDate });
    setShowFilter(true);
  }
  function applyDateRange() {
    setFilters((current) => ({ ...current, ...dateRange }));
    setShowFilter(false);
  }

  const completed = sessions.filter(
    (session) => session.status === "COMPLETED",
  );
  const totalHonor = completed.reduce(
    (sum, session) => sum + Number(session.honorRateSnapshot || 0),
    0,
  );
  const totalMinutes = completed
    .filter((session) => session.startTime && session.endTime)
    .reduce(
      (sum, session) =>
        sum +
        Math.max(
          0,
          (new Date(session.endTime!).getTime() -
            new Date(session.startTime!).getTime()) /
            60000,
        ),
      0,
    );
  const duration = totalMinutes
    ? `${Math.floor(totalMinutes / 60) ? `${Math.floor(totalMinutes / 60)}j ` : ""}${totalMinutes % 60 ? `${totalMinutes % 60}m` : ""}`.trim()
    : "0m";
  const monthLabel = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${period}-01T00:00:00`));

  return (
    <div className="space-y-4 pb-3">
      <h1 className="text-[22px] font-bold text-navy-900">Rekap Mengajar</h1>
      <section className="rounded-2xl bg-gradient-to-br from-navy-950 to-navy-800 p-4 text-white shadow-sm">
        <p className="text-sm text-navy-200">Estimasi Honor</p>
        <p className="mt-1 break-words text-[29px] font-bold leading-tight tracking-tight sm:text-3xl">
          {formatRupiah(totalHonor)}
        </p>
        <div className="mt-3 grid grid-cols-2 border-t border-white/20 pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <IconCheckCircle className="h-5 w-5 shrink-0 text-navy-100" />
            <div>
              <p className="text-[17px] font-semibold leading-tight">
                {completed.length}
              </p>
              <p className="whitespace-nowrap text-[11px] text-navy-200">
                Sesi Selesai
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 border-l border-white/20 pl-3">
            <IconClock className="h-5 w-5 shrink-0 text-navy-100" />
            <div className="min-w-0">
              <p className="truncate text-[17px] font-semibold leading-tight">
                {duration}
              </p>
              <p className="whitespace-nowrap text-[11px] text-navy-200">
                Jam Mengajar
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <label className="relative flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-navy-900">
            <IconSchedule className="h-5 w-5 shrink-0 text-navy-700" />
            <span className="truncate capitalize">{monthLabel}</span>
            <IconChevronRight className="ml-auto h-4 w-4 shrink-0 rotate-90 text-gray-400" />
            <input
              aria-label="Pilih periode rekap"
              type="month"
              value={period}
              onChange={(event) => selectPeriod(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
          <button
            type="button"
            onClick={openFilter}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-navy-800"
          >
            <IconFilter className="h-4 w-4" />
            Filter
          </button>
        </div>
        <div className="flex gap-2" role="group" aria-label="Jenis sesi">
          {[
            ["", "Semua"],
            ["REGULAR", "Reguler"],
            ["PRIVATE", "Privat"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                setFilters((current) => ({ ...current, sessionType: value }))
              }
              className={`min-h-9 rounded-full border px-4 text-xs font-semibold transition ${filters.sessionType === value ? "border-navy-900 bg-navy-900 text-white" : "border-gray-200 bg-white text-navy-800"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <p className="text-sm font-semibold text-navy-900">Slip Honor</p>
          <p className="mt-1 text-xs text-gray-500">
            Unduh dokumen honor sesuai periode yang dipilih.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={slipPeriod.month}
            onChange={(event) =>
              setSlipPeriod({ ...slipPeriod, month: event.target.value })
            }
            aria-label="Bulan slip honor"
            className="min-h-10 rounded-xl border border-gray-200 px-3 text-xs text-navy-900"
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {new Intl.DateTimeFormat("id-ID", { month: "long" }).format(
                  new Date(2026, index, 1),
                )}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="2000"
            value={slipPeriod.year}
            onChange={(event) =>
              setSlipPeriod({ ...slipPeriod, year: event.target.value })
            }
            aria-label="Tahun slip honor"
            className="min-h-10 rounded-xl border border-gray-200 px-3 text-xs text-navy-900"
          />
        </div>
        <button
          onClick={downloadSlip}
          disabled={downloadingSlip}
          className="mt-3 min-h-11 w-full rounded-xl bg-navy-900 text-sm font-semibold text-white disabled:opacity-60"
        >
          {downloadingSlip ? "Menyiapkan slip..." : "Unduh Slip Honor"}
        </button>
        {slipMessage && (
          <p className="mt-2 text-xs text-red-600">{slipMessage}</p>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-navy-900">
          Riwayat Mengajar
        </h2>
        {loading ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-400">
            Tidak ada data untuk filter ini.
          </p>
        ) : (
          sessions.map((session) => (
            <Link
              key={session.id}
              href={`/tentor/sessions/${session.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-3 transition hover:border-navy-200 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {session.sessionType === "REGULAR"
                      ? session.class?.name
                      : session.student?.name}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                    <TypeBadge type={session.sessionType} />
                    {formatDate(session.sessionDate)} &middot;{" "}
                    {session.subject?.name}
                  </p>
                </div>
                <StatusBadge status={session.status} />
              </div>
              {session.status === "COMPLETED" && (
                <p className="mt-2 text-sm font-medium text-gray-900">
                  {formatRupiah(session.honorRateSnapshot)}
                </p>
              )}
            </Link>
          ))
        )}
      </section>
      {showFilter && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-slate-950/40"
          role="dialog"
          aria-modal="true"
          aria-label="Filter Rekap"
        >
          <div className="w-full rounded-t-3xl bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-200" />
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-navy-900">
                  Filter Rekap
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Tentukan rentang tanggal secara khusus.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFilter(false)}
                aria-label="Tutup filter"
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-medium text-gray-600">
                Tanggal Mulai
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(event) =>
                    setDateRange((current) => ({
                      ...current,
                      startDate: event.target.value,
                    }))
                  }
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-gray-200 px-3 text-sm text-navy-900"
                />
              </label>
              <label className="block text-xs font-medium text-gray-600">
                Tanggal Selesai
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(event) =>
                    setDateRange((current) => ({
                      ...current,
                      endDate: event.target.value,
                    }))
                  }
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-gray-200 px-3 text-sm text-navy-900"
                />
              </label>
              <button
                type="button"
                onClick={applyDateRange}
                className="mt-2 min-h-12 w-full rounded-xl bg-navy-900 text-sm font-semibold text-white"
              >
                Terapkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
