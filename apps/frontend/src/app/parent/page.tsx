"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  IconBook,
  IconChevronRight,
  IconClock,
  IconParent,
  IconReport,
  IconSchedule,
  IconX,
} from "@/components/icons";

interface Program {
  type: "REGULAR" | "PRIVATE";
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
  startTime: string | null;
  endTime: string | null;
  mode: string | null;
  location: string | null;
  material: string | null;
  progressNotes: string | null;
  score: string | number | null;
}
interface ChildProgress {
  privateSessions: PrivateSessionRow[];
}
const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function ParentHomePage() {
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState(() => localDate(new Date()));
  const [parentName, setParentName] = useState<string | null>(null);
  const [progress, setProgress] = useState<ChildProgress | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [selectedProgress, setSelectedProgress] = useState<PrivateSessionRow | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const loadChildren = useCallback(async () => {
    setLoadingChildren(true);
    setError(null);
    try {
      const response = await api.get("/parent/children");
      const data = response.data.data as ChildSummary[];
      setChildren(data);
      setSelectedId((current) =>
        current && data.some((child) => child.student.id === current)
          ? current
          : data[0]?.student.id || "",
      );
    } catch {
      setError("Gagal memuat data anak.");
    } finally {
      setLoadingChildren(false);
    }
  }, []);

  useEffect(() => {
    loadChildren();
    api
      .get("/parent/me")
      .then((response) => setParentName(response.data.data?.name || null))
      .catch(() => {});
  }, [loadChildren]);

  const loadProgress = useCallback(async (studentId: string, date: string) => {
    setLoadingProgress(true);
    setProgress(null);
    try {
      const response = await api.get(`/parent/children/${studentId}/progress`, {
        params: { date },
      });
      setProgress(response.data.data);
    } catch {
      setError("Gagal memuat perkembangan anak.");
    } finally {
      setLoadingProgress(false);
    }
  }, []);

  useEffect(() => {
    setSelectedProgress(null);
    if (selectedId) loadProgress(selectedId, selectedDate);
  }, [selectedId, selectedDate, loadProgress]);

  const selected = children.find((child) => child.student.id === selectedId);
  const privateProgram = selected?.student.programs.find(
    (program) => program.type === "PRIVATE",
  );
  const filteredProgress = progress?.privateSessions || [];
  const formattedSelectedDate = selectedDate
    ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Pilih tanggal";

  function openDatePicker() {
    const input = dateInputRef.current;
    if (!input) return;

    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  }

  async function handleDownload() {
    if (!selectedId) return;
    setDownloading(true);
    try {
      const response = await api.get(
        `/parent/children/${selectedId}/report.pdf`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `laporan-${selected?.student.name || "siswa"}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("Gagal mengunduh laporan.");
    } finally {
      setDownloading(false);
    }
  }

  if (loadingChildren)
    return (
      <div className="space-y-5" aria-label="Memuat beranda">
        <div className="h-20 animate-pulse rounded-2xl bg-gray-100" />
        <div className="h-48 animate-pulse rounded-2xl bg-navy-100" />
        <div className="h-28 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  if (error && children.length === 0)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-9 text-center">
        <p className="text-sm text-red-700">Gagal memuat data anak.</p>
        <button
          type="button"
          onClick={loadChildren}
          className="mt-3 min-h-11 text-sm font-semibold text-navy-800"
        >
          Coba Lagi
        </button>
      </div>
    );
  if (children.length === 0)
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-9 text-center">
        <p className="text-sm text-gray-500">
          Belum ada anak yang terhubung ke akun Anda. Hubungi Admin.
        </p>
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-md space-y-6 pb-5">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </div>
      )}
      <div className="grid gap-3 min-[390px]:grid-cols-2">
        <label className="block min-w-0">
          <span className="mb-1.5 block text-sm text-gray-500">Anak Anda</span>
          <div className="relative">
            <select
              aria-label="Pilih anak"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="min-h-[52px] w-full cursor-pointer appearance-none rounded-2xl border border-navy-100 bg-white px-3 pr-10 text-sm font-semibold text-navy-900 outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-100"
            >
              {children.map((child) => (
                <option key={child.student.id} value={child.student.id}>
                  {child.student.name}
                </option>
              ))}
            </select>
            <IconChevronRight className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 rotate-90 text-gray-400" />
          </div>
        </label>
        <div className="block min-w-0">
          <span className="mb-1.5 block text-sm text-gray-500">Tanggal</span>
          <button
            type="button"
            aria-label="Pilih tanggal"
            onClick={openDatePicker}
            className="flex min-h-[52px] w-full items-center rounded-2xl border border-navy-100 bg-white px-3 text-left text-sm font-semibold text-navy-900 outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-100"
          >
            <IconSchedule className="h-5 w-5 shrink-0 text-navy-800" />
            <span className="ml-2 truncate capitalize">{formattedSelectedDate}</span>
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            tabIndex={-1}
            className="pointer-events-none absolute h-px w-px opacity-0"
          />
        </div>
      </div>

      <section className="rounded-2xl bg-navy-900 p-5 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-navy-200">Selamat datang,</p>
            <p className="mt-1 max-w-[13rem] break-words text-[21px] font-bold leading-tight">
              {parentName || "Bapak/Ibu Wali"}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium">
            Orang Tua
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 border-t border-white/20 pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <IconParent className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] text-navy-200">Anak Aktif</p>
              <p className="mt-1 truncate text-base font-semibold">
                {selected?.student.name}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3 border-l border-white/20 pl-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <IconClock className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] text-navy-200">Sisa Sesi</p>
              <p className="mt-1 truncate text-base font-semibold">
                {privateProgram ? `${privateProgram.quotaRemaining} sesi` : "—"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-navy-100 bg-white px-4 text-sm font-semibold text-navy-900 shadow-sm disabled:opacity-60"
      >
        <IconReport className="h-5 w-5 text-red-500" />
        {downloading ? "Menyiapkan laporan..." : "Unduh Laporan Progress (PDF)"}
      </button>

      <section>
        <h2 className="mb-3 text-[17px] font-semibold text-navy-900">
          Progress Belajar
        </h2>
        {loadingProgress ? (
          <div className="h-32 animate-pulse rounded-2xl bg-gray-100" />
        ) : filteredProgress.length === 0 ? (
          <EmptyCard
            icon={<IconBook className="h-6 w-6" />}
            title="Belum ada progress belajar pada tanggal ini."
          />
        ) : (
          <div className="space-y-3">
            {filteredProgress.map((session) => (
              <button
                type="button"
                key={session.id}
                onClick={() => setSelectedProgress(session)}
                aria-label={`Lihat detail perkembangan ${session.subjectName || "sesi privat"}`}
                className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-navy-200 hover:bg-navy-50/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-700"
              >
                <div className="flex gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-800">
                    <IconBook className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-navy-900">
                          {session.subjectName || "Mata pelajaran"}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {formatDate(session.sessionDate)} &middot;{" "}
                          {session.tutorName}
                        </p>
                      </div>
                      <IconChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
                    </div>
                    {session.material && (
                      <div className="mt-4">
                        <p className="text-xs font-medium text-gray-500">Materi</p>
                        <p className="mt-1 max-h-10 overflow-hidden break-words text-sm leading-5 text-gray-600">{session.material}</p>
                      </div>
                    )}
                    {session.progressNotes && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-gray-500">Catatan Perkembangan</p>
                        <p className="mt-1 max-h-10 overflow-hidden break-words text-sm leading-5 text-gray-600">{session.progressNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedProgress && <ProgressDetailSheet session={selectedProgress} onClose={() => setSelectedProgress(null)} />}
    </div>
  );
}

function ProgressDetailSheet({
  session,
  onClose,
}: {
  session: PrivateSessionRow;
  onClose: () => void;
}) {
  const timeRange = formatTimeRange(session.startTime, session.endTime);
  const modeLocation = [session.mode, session.location].filter(Boolean).join(" · ");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="progress-detail-title"
      className="fixed inset-0 z-50 flex items-end bg-black/35"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="max-h-[88vh] w-full overflow-y-auto rounded-t-[24px] bg-white px-5 pb-7 pt-3 shadow-2xl">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-gray-200" />
        <div className="mt-3 flex items-center justify-between gap-4">
          <h2 id="progress-detail-title" className="text-[19px] font-bold text-navy-900">Detail Perkembangan</h2>
          <button type="button" onClick={onClose} aria-label="Tutup detail perkembangan" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-700">
            <IconX className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 border-b border-gray-100 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-bold text-navy-900">{session.subjectName || "Mata pelajaran"}</p>
            <span className="rounded-full bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-800">Privat</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">{formatLongDate(session.sessionDate)}</p>
          {timeRange && <p className="mt-1 text-sm text-gray-500">{timeRange}</p>}
          {modeLocation && <p className="mt-1 text-sm text-gray-500">{modeLocation}</p>}
        </div>
        <div className="space-y-5 py-5">
          <DetailRow label="Tentor" value={session.tutorName} />
          <DetailRow label="Materi Hari Ini" value={session.material} />
          <DetailRow label="Catatan Perkembangan" value={session.progressNotes} />
          {session.score !== null && session.score !== undefined && <DetailRow label="Nilai" value={String(session.score)} />}
        </div>
        <button type="button" onClick={onClose} className="min-h-[48px] w-full rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-700">Tutup</button>
      </section>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <div><p className="text-xs font-medium text-gray-500">{label}</p><p className="mt-1 break-words text-sm leading-6 text-navy-900">{value}</p></div>;
}

function formatLongDate(value: string) {
  return new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function formatTimeRange(startTime: string | null, endTime: string | null) {
  const formatTime = (value: string) => new Date(value).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (startTime && endTime) return `${formatTime(startTime)} – ${formatTime(endTime)}`;
  if (startTime) return formatTime(startTime);
  return null;
}

function EmptyCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-[104px] items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-800">
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-navy-900">{title}</p>
        {description && (
          <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>
        )}
      </div>
    </div>
  );
}
