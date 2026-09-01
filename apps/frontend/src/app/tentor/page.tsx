"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { StatusBadge, TypeBadge } from "@/components/StatusBadge";
import {
  IconWarning,
  IconBook,
  IconStar,
  IconStudent,
  IconSchedule,
  IconClock,
  IconChevronLeft,
  IconChevronRight,
} from "@/components/icons";

interface Quota {
  quotaTotal: number;
  quotaRemaining: number;
}

interface SessionItem {
  id: string;
  sessionType: string;
  sessionDate: string;
  status: string;
  class?: (Quota & { name: string }) | null;
  student?: { name: string; packages?: Quota[] } | null;
  subject?: { name: string } | null;
  startTime?: string | null;
  endTime?: string | null;
  schedule?: { startTime: string; endTime: string } | null;
}

interface TentorDashboard {
  tutorName: string | null;
  todaySessions: SessionItem[];
  unfinishedSessions: SessionItem[];
  totalCompletedSessions: number;
}

const CANCELLED_STATUSES = new Set(["CANCELLED", "CANCELLED_NOT_COUNTED"]);
const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function sessionQuota(s: SessionItem): Quota | null {
  return s.sessionType === "REGULAR"
    ? (s.class ?? null)
    : (s.student?.packages?.[0] ?? null);
}

function sessionMinutes(s: SessionItem): number | null {
  const start = s.startTime || s.schedule?.startTime;
  const end = s.endTime || s.schedule?.endTime;
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.round(diff / 60000));
}

function formatHours(totalMinutes: number) {
  const hours = totalMinutes / 60;
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// Monday of the week containing `date`.
function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekMonthLabel(monday: Date) {
  const friday = addDays(monday, 4);
  const formatter = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  });
  const startLabel = formatter.format(monday);
  const endLabel = formatter.format(friday);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

function sessionTitle(s: SessionItem) {
  return s.sessionType === "REGULAR" ? s.class?.name : s.student?.name;
}

function monthRange(date: Date) {
  return {
    start: isoDate(new Date(date.getFullYear(), date.getMonth() - 1, 1)),
    end: isoDate(new Date(date.getFullYear(), date.getMonth() + 2, 0)),
  };
}

export default function TentorHomePage() {
  const [data, setData] = useState<TentorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [rangeSessions, setRangeSessions] = useState<SessionItem[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const selectedCardRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    api
      .get("/dashboard/tentor")
      .then((res) => setData(res.data.data))
      .catch(() => setError("Gagal memuat data."))
      .finally(() => setLoading(false));
  }, []);

  const loadSelectedSchedule = useCallback(async () => {
    const range = monthRange(calendarOpen ? calendarMonth : selectedDate);
    setScheduleLoading(true);
    setScheduleError(null);
    try {
      const res = await api.get("/sessions", {
        params: { startDate: range.start, endDate: range.end },
      });
      setRangeSessions(res.data.data);
    } catch {
      setScheduleError("Gagal memuat jadwal.");
    } finally {
      setScheduleLoading(false);
    }
  }, [calendarMonth, calendarOpen, selectedDate]);

  useEffect(() => {
    loadSelectedSchedule();
  }, [loadSelectedSchedule]);

  useEffect(() => {
    selectedCardRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedDate]);

  if (loading) return <p className="text-sm text-gray-400">Memuat...</p>;
  if (error || !data)
    return (
      <p className="text-sm text-red-500">{error ?? "Data tidak tersedia."}</p>
    );

  const now = new Date();
  const stripDays = Array.from({ length: 15 }, (_, i) =>
    addDays(selectedDate, i - 4),
  );
  const monthLabel = selectedDate.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
  const selectedDateKey = isoDate(selectedDate);
  const isSelectedToday = selectedDateKey === isoDate(now);
  const sessionsByDate = new Set(
    rangeSessions.map((session) => isoDate(new Date(session.sessionDate))),
  );
  const selectedSessions = rangeSessions.filter(
    (session) => isoDate(new Date(session.sessionDate)) === selectedDateKey,
  );

  const activeToday = data.todaySessions.filter(
    (s) => !CANCELLED_STATUSES.has(s.status),
  );
  const totalMinutesToday = activeToday.reduce(
    (sum, s) => sum + (sessionMinutes(s) ?? 0),
    0,
  );

  const sortedSessions = [...selectedSessions].sort((a, b) => {
    const ta = a.startTime
      ? new Date(a.startTime).getTime()
      : a.schedule
        ? new Date(a.schedule.startTime).getTime()
        : new Date(a.sessionDate).getTime();
    const tb = b.startTime
      ? new Date(b.startTime).getTime()
      : b.schedule
        ? new Date(b.schedule.startTime).getTime()
        : new Date(b.sessionDate).getTime();
    return ta - tb;
  });
  const isUpcoming = (s: SessionItem) => {
    const start = s.startTime || s.schedule?.startTime;
    return (
      isSelectedToday &&
      !CANCELLED_STATUSES.has(s.status) &&
      !!start &&
      new Date(start) > now
    );
  };
  const upcomingSessions = sortedSessions.filter(isUpcoming);
  const pastSessions = sortedSessions.filter((s) => !isUpcoming(s));
  const nextSession = isSelectedToday ? (upcomingSessions[0] ?? null) : null;
  const scheduleTitle = isSelectedToday
    ? "Jadwal Hari Ini"
    : `Jadwal ${selectedDate.toLocaleDateString("id-ID", { day: "numeric", month: "long" })}`;

  return (
    <div className="space-y-6">
      {/* Greeting card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-900 to-navy-700 p-5 text-white shadow-sm">
        <span className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium">
          Tentor
        </span>
        <p className="text-sm text-navy-200">Selamat datang,</p>
        <p className="mt-0.5 text-lg font-semibold">
          {data.tutorName || "Tentor"}
        </p>

        <div className="mt-4 flex items-center gap-6 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <IconSchedule className="h-4 w-4" />
            </div>
            <div>
              <p className="text-base font-semibold leading-none">
                {data.todaySessions.length}
              </p>
              <p className="mt-1 text-[11px] text-navy-200">Sesi Hari Ini</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <IconClock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-base font-semibold leading-none">
                {formatHours(totalMinutesToday)}
              </p>
              <p className="mt-1 text-[11px] text-navy-200">Jam Mengajar</p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigasi tanggal */}
      <div>
        <button
          type="button"
          onClick={() => {
            setCalendarMonth(selectedDate);
            setCalendarOpen(true);
          }}
          className="mb-3 flex min-h-10 items-center gap-1 text-sm font-semibold capitalize text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-700"
        >
          {monthLabel}
          <IconChevronRight className="h-4 w-4 rotate-90" />
        </button>
        <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {stripDays.map((d) => {
            const isSelected = isoDate(d) === selectedDateKey;
            const hasSchedule = sessionsByDate.has(isoDate(d));
            return (
              <button
                key={isoDate(d)}
                type="button"
                onClick={() => setSelectedDate(d)}
                aria-pressed={isSelected}
                ref={isSelected ? selectedCardRef : null}
                aria-label={`Pilih ${d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}`}
                className={`flex h-[104px] w-[58px] shrink-0 snap-center flex-col items-center justify-center gap-1.5 rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-700 focus-visible:ring-offset-2 ${
                  isSelected
                    ? "border-navy-900 bg-navy-900 text-white ring-2 ring-navy-100"
                    : "border-gray-100 bg-white text-gray-600 hover:border-navy-200 hover:bg-navy-50"
                }`}
              >
                <span className="text-[11px]">{DAY_LABELS[d.getDay()]}</span>
                <span className="text-sm font-semibold">{d.getDate()}</span>
                {hasSchedule ? (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : "bg-blue-600"}`}
                    aria-label="Ada jadwal"
                  />
                ) : (
                  <span className="h-1.5 w-1.5" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Jadwal Berikutnya */}
      {nextSession && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <IconStar className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-gray-900">
              Jadwal Berikutnya
            </h2>
          </div>
          <NextSessionCard session={nextSession} />
        </div>
      )}

      {/* Jadwal tanggal terpilih */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            {scheduleTitle}
          </h2>
          <Link
            href="/tentor/schedule"
            className="text-xs font-medium text-navy-700 hover:underline"
          >
            Lihat Semua
          </Link>
        </div>
        {scheduleLoading ? (
          <div
            className="space-y-2"
            aria-live="polite"
            aria-label="Memuat jadwal"
          >
            <div className="h-20 animate-pulse rounded-xl border border-gray-100 bg-gray-50" />
            <div className="h-20 animate-pulse rounded-xl border border-gray-100 bg-gray-50" />
          </div>
        ) : scheduleError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-center">
            <p className="text-sm text-red-600">{scheduleError}</p>
            <button
              onClick={loadSelectedSchedule}
              className="mt-2 text-xs font-medium text-navy-700 hover:underline"
            >
              Coba Lagi
            </button>
          </div>
        ) : selectedSessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center">
            <p className="text-sm text-gray-400">
              Tidak ada jadwal pada tanggal ini.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {pastSessions.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
            {pastSessions.length > 0 && upcomingSessions.length > 0 && (
              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 border-t border-dashed border-gray-200" />
                <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  Sesi Berikutnya
                </span>
                <div className="h-px flex-1 border-t border-dashed border-gray-200" />
              </div>
            )}
            {upcomingSessions.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </div>
        )}
      </div>

      {data.unfinishedSessions.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">
            Sesi Belum Selesai
          </h2>
          <ul className="space-y-2">
            {data.unfinishedSessions.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-gray-200 bg-white p-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {sessionTitle(s)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(s.sessionDate).toLocaleDateString("id-ID")}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {calendarOpen && (
        <CalendarSheet
          month={calendarMonth}
          setMonth={setCalendarMonth}
          selectedDate={selectedDateKey}
          scheduleDates={sessionsByDate}
          onClose={() => setCalendarOpen(false)}
          onSelect={(date) => {
            setSelectedDate(date);
            setCalendarOpen(false);
          }}
        />
      )}
    </div>
  );
}

function CalendarSheet({
  month,
  setMonth,
  selectedDate,
  scheduleDates,
  onClose,
  onSelect,
}: {
  month: Date;
  setMonth: (date: Date) => void;
  selectedDate: string;
  scheduleDates: Set<string>;
  onClose: () => void;
  onSelect: (date: Date) => void;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  return (
    <div
      className="fixed inset-0 z-30 flex items-end bg-slate-950/40"
      role="dialog"
      aria-modal="true"
      aria-label="Pilih Tanggal"
    >
      <div className="w-full rounded-t-3xl bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-200" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-navy-900">
            Pilih Tanggal
          </h2>
          <button
            onClick={onClose}
            className="text-sm font-medium text-gray-500"
          >
            Tutup
          </button>
        </div>
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
            aria-label="Bulan sebelumnya"
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"
          >
            <IconChevronLeft className="h-5 w-5" />
          </button>
          <p className="text-sm font-semibold capitalize text-navy-900">
            {month.toLocaleDateString("id-ID", {
              month: "long",
              year: "numeric",
            })}
          </p>
          <button
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
            aria-label="Bulan berikutnya"
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"
          >
            <IconChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-gray-500">
          {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day) => (
            <span key={day} className="py-2">
              {day}
            </span>
          ))}
          {days.map((day) => {
            const key = isoDate(day);
            const selected = key === selectedDate;
            const currentMonth = day.getMonth() === month.getMonth();
            const hasSchedule = scheduleDates.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(day)}
                className={`mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-full text-sm font-medium ${selected ? "bg-blue-600 text-white" : currentMonth ? "text-navy-900 hover:bg-navy-50" : "text-gray-300"}`}
              >
                <span>{day.getDate()}</span>
                {hasSchedule && (
                  <span
                    className={`h-1 w-1 rounded-full ${selected ? "bg-white" : "bg-blue-600"}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NextSessionCard({ session: s }: { session: SessionItem }) {
  const quota = sessionQuota(s);
  const isEmpty = quota != null && quota.quotaRemaining === 0;
  const canFillNow = s.status === "IN_PROGRESS" || s.status === "SCHEDULED";
  const minutes = sessionMinutes(s);
  const start = s.startTime || s.schedule?.startTime;
  const end = s.endTime || s.schedule?.endTime;

  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm ${isEmpty ? "border-red-200 bg-red-50/40" : "border-navy-100"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TypeBadge type={s.sessionType} />
          <span className="flex items-center gap-1">
            <StatusBadge status={s.status} />
            {s.status === "COMPLETED" && (
              <IconChevronRight className="h-4 w-4 text-gray-400" />
            )}
          </span>
        </div>
        {start && end && (
          <span className="text-xs font-medium text-gray-500">
            {formatTime(start)}–{formatTime(end)}
            {minutes != null && ` · ${minutes} Menit`}
          </span>
        )}
      </div>

      <p className="mt-2.5 flex items-center gap-1.5 text-base font-semibold text-gray-900">
        {s.sessionType === "PRIVATE" && (
          <IconStudent className="h-4 w-4 shrink-0 text-gray-400" />
        )}
        {sessionTitle(s)}
      </p>
      {s.subject?.name && (
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500">
          <IconBook className="h-3.5 w-3.5 shrink-0" /> {s.subject.name}
        </p>
      )}

      {isEmpty ? (
        <div className="mt-3.5 flex gap-2 rounded-lg bg-red-100/70 px-3 py-2.5">
          <IconWarning className="h-4 w-4 shrink-0 text-red-600" />
          <p className="text-xs text-red-700">
            {s.sessionType === "REGULAR"
              ? "Pertemuan kelas habis."
              : "Paket pertemuan habis."}{" "}
            Hubungi Admin untuk menambah kuota.
          </p>
        </div>
      ) : (
        <Link
          href={`/tentor/sessions/${s.id}`}
          className={`mt-3.5 block rounded-xl bg-navy-900 py-2.5 text-center text-sm font-medium text-white hover:bg-navy-800 ${
            canFillNow ? "" : "pointer-events-none opacity-40"
          }`}
        >
          Mulai Kelas
        </Link>
      )}
    </div>
  );
}

function SessionRow({ session: s }: { session: SessionItem }) {
  const quota = sessionQuota(s);
  const isEmpty = quota != null && quota.quotaRemaining === 0;
  const canFillNow = s.status === "IN_PROGRESS" || s.status === "SCHEDULED";
  const start = s.startTime || s.schedule?.startTime;
  const end = s.endTime || s.schedule?.endTime;
  const content = (
    <div
      className={`flex gap-3 rounded-xl border bg-white p-3 ${isEmpty ? "border-red-200 bg-red-50/40" : "border-gray-200"}`}
    >
      <div className="w-11 shrink-0 pt-0.5 text-xs font-semibold text-gray-700">
        {start ? formatTime(start) : "-"}
      </div>
      <div className="min-w-0 flex-1 border-l border-gray-100 pl-3">
        <div className="flex items-center justify-between gap-2">
          <TypeBadge type={s.sessionType} />
          <StatusBadge status={s.status} />
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 truncate text-sm font-medium text-gray-900">
          {s.sessionType === "PRIVATE" && (
            <IconStudent className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          )}
          {sessionTitle(s)}
        </p>
        {isEmpty ? (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-red-600">
            <IconWarning className="h-3 w-3 shrink-0" /> Kuota habis
          </p>
        ) : (
          <p className="truncate text-xs text-gray-500">
            {s.subject?.name}
            {start && end && ` • ${formatTime(start)}–${formatTime(end)}`}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <Link
      href={`/tentor/sessions/${s.id}`}
      aria-label={`Lihat detail sesi ${s.subject?.name || sessionTitle(s) || ""}`}
      className="block cursor-pointer transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-700 focus-visible:ring-offset-2"
    >
      {content}
    </Link>
  );
}
