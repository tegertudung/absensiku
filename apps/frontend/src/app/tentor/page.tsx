"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import api from "@/lib/api";
import MascotImage from "@/components/MascotImage";
import {
  tutorCombineScheduleTime,
  tutorDateKey,
  tutorScheduleOccursOn,
} from "@/lib/tutorAgenda";
import {
  renderTutorMascotTemplate,
  selectTutorMascotState,
  TutorMascotStateKey,
} from "@/lib/tutorMascotDisplay";
import { StatusBadge, TypeBadge } from "@/components/StatusBadge";
import {
  IconWarning,
  IconBook,
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
  scheduleId?: string | null;
  sessionType: string;
  sessionDate: string;
  status: string;
  class?: (Quota & { name: string }) | null;
  student?: { name: string; packages?: Quota[] } | null;
  subject?: { name: string } | null;
  startTime?: string | null;
  endTime?: string | null;
  schedule?: { startTime: string; endTime: string } | null;
  virtual?: boolean;
}

interface ScheduleItem {
  id: string;
  sessionType: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string | null;
  status: string;
  occurrenceDate?: string | null;
  class?: (Quota & { name: string }) | null;
  student?: { name: string; packages?: Quota[] } | null;
  subject?: { name: string } | null;
}

interface TentorDashboard {
  tutorName: string | null;
  todaySessions: SessionItem[];
  unfinishedSessions: SessionItem[];
  totalCompletedSessions: number;
}

interface ActiveMascot {
  id: string;
  name: string;
}

interface TutorMascotDisplayConfig {
  mode: "MANUAL" | "AUTO";
  states: Record<
    TutorMascotStateKey,
    { mascotId: string | null; template: string }
  >;
}

const CANCELLED_STATUSES = new Set(["CANCELLED", "CANCELLED_NOT_COUNTED"]);
const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function isoDate(date: Date) {
  return tutorDateKey(date);
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

function weekOfMonth(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  return Math.ceil((date.getDate() + offset) / 7);
}

function greetingName(name: string | null) {
  return name?.trim().split(/\s+/)[0] || "Tentor";
}

function agendaSessionsForDate(
  date: Date,
  schedules: ScheduleItem[],
  sessions: SessionItem[],
) {
  const dateKey = isoDate(date);
  const sessionsForDate = sessions.filter(
    (session) => isoDate(new Date(session.sessionDate)) === dateKey,
  );
  const usedScheduleIds = new Set<string>();
  const agenda = schedules
    .filter((schedule) => tutorScheduleOccursOn(schedule, date))
    .map((schedule) => {
      const existing = sessionsForDate.find(
        (session) => session.scheduleId === schedule.id,
      );
      if (existing) {
        usedScheduleIds.add(schedule.id);
        return existing;
      }
      return {
        id: `virtual-${schedule.id}-${dateKey}`,
        scheduleId: schedule.id,
        sessionType: schedule.sessionType,
        sessionDate: dateKey,
        status: "SCHEDULED",
        class: schedule.class ?? null,
        student: schedule.student ?? null,
        subject: schedule.subject ?? null,
        startTime: tutorCombineScheduleTime(date, schedule.startTime),
        endTime: tutorCombineScheduleTime(date, schedule.endTime),
        virtual: true,
      } satisfies SessionItem;
    });

  return [
    ...agenda,
    ...sessionsForDate.filter((s) => !usedScheduleIds.has(s.scheduleId ?? "")),
  ];
}

export default function TentorHomePage() {
  const [data, setData] = useState<TentorDashboard | null>(null);
  const [activeMascot, setActiveMascot] = useState<ActiveMascot | null>(null);
  const [mascotDisplayConfig, setMascotDisplayConfig] =
    useState<TutorMascotDisplayConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
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

  useEffect(() => {
    api
      .get("/tutor-mascots/display-config")
      .then((response) =>
        setMascotDisplayConfig(response.data.data as TutorMascotDisplayConfig),
      )
      .catch(() => setMascotDisplayConfig(null));
  }, []);

  useEffect(() => {
    api
      .get("/tutor-mascots/active")
      .then((response) => setActiveMascot(response.data.data ?? null))
      .catch(() => setActiveMascot(null));
  }, []);

  const loadSelectedSchedule = useCallback(async () => {
    const range = monthRange(calendarOpen ? calendarMonth : selectedDate);
    setScheduleLoading(true);
    setScheduleError(null);
    try {
      const [scheduleResponse, sessionResponse] = await Promise.all([
        api.get("/schedules"),
        api.get("/sessions", {
          params: { startDate: range.start, endDate: range.end },
        }),
      ]);
      setSchedules(scheduleResponse.data.data);
      setRangeSessions(sessionResponse.data.data);
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
  const weekDays = Array.from({ length: 9 }, (_, i) =>
    addDays(selectedDate, i - 4),
  );
  const monthLabel = selectedDate.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
  const selectedDateKey = isoDate(selectedDate);
  const isSelectedToday = selectedDateKey === isoDate(now);
  const sessionsForDate = (date: Date) =>
    agendaSessionsForDate(date, schedules, rangeSessions);
  const todayMascotSessions = agendaSessionsForDate(
    now,
    schedules,
    data.todaySessions,
  );
  const mascotState =
    mascotDisplayConfig?.mode === "AUTO"
      ? selectTutorMascotState(todayMascotSessions, now)
      : null;
  const mascotDisplayRule = mascotState
    ? mascotDisplayConfig!.states[mascotState.state]
    : null;
  const mascotId = mascotDisplayRule?.mascotId ?? activeMascot?.id ?? null;
  const mascotSubtitle = mascotDisplayRule
    ? renderTutorMascotTemplate(mascotDisplayRule.template, {
        nama: greetingName(data.tutorName),
        jumlahSesi: mascotState!.activeSessions.length,
        jamBerikutnya: mascotState?.nextSession
          ? formatTime(
              mascotState.nextSession.startTime ||
                mascotState.nextSession.schedule!.startTime,
            )
          : "",
        mapelBerikutnya: mascotState?.nextSession?.subject?.name || "",
        kelasBerikutnya: mascotState?.nextSession
          ? sessionTitle(mascotState.nextSession) || ""
          : "",
      })
    : "Siapmi mengajar hari ini?";
  const selectedSessions = sessionsForDate(selectedDate);
  const sessionsByDate = new Set(
    weekDays
      .filter((date) => sessionsForDate(date).length > 0)
      .map((date) => isoDate(date)),
  );

  const activeSelectedSessions = selectedSessions.filter(
    (s) => !CANCELLED_STATUSES.has(s.status),
  );
  const totalMinutesSelected = activeSelectedSessions.reduce(
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
  const summarySession = isSelectedToday
    ? (upcomingSessions[0] ?? sortedSessions[0] ?? null)
    : (sortedSessions[0] ?? null);

  return (
    <div className="mx-auto max-w-md">
      <section className="relative mb-4 min-h-[96px] pt-1">
        <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-blue-700">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          {selectedDate.toLocaleDateString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </div>
        <h1 className="mt-2 max-w-[240px] text-xl font-bold tracking-tight text-navy-900">
          Pagi, Kak {greetingName(data.tutorName)}{" "}
          <span aria-hidden="true">👋</span>
        </h1>
        <p className="mt-0.5 max-w-[235px] text-[13px] leading-5 text-slate-500">
          {mascotSubtitle}
        </p>
        <div className="absolute right-3 top-0 flex h-20 w-20 shrink-0 items-center justify-center overflow-visible min-[390px]:h-[88px] min-[390px]:w-[88px] sm:h-[92px] sm:w-[92px]">
          {mascotId ? (
            <MascotImage
              mascotId={mascotId}
              fallbackMascotId={
                activeMascot && mascotId !== activeMascot.id
                  ? activeMascot.id
                  : null
              }
              alt={activeMascot?.name || "Maskot Pioneer Class"}
              fallbackSrc="/tentor-akpol-mascot.png"
              className="h-full w-full object-contain"
            />
          ) : (
            <Image
              src="/tentor-akpol-mascot.png"
              alt="Maskot Pioneer Class"
              width={92}
              height={92}
              priority
              className="h-full w-full object-contain"
            />
          )}
        </div>
      </section>

      <section className="mb-6 rounded-2xl bg-gradient-to-br from-navy-950 to-navy-800 p-4 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium text-navy-200">
              RINGKASAN HARI INI
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              Jadwal ta hari ini
            </h2>
          </div>
          <span className="rounded-full border border-white/20 px-2.5 py-1 text-[11px] font-medium text-navy-100">
            Tentor
          </span>
        </div>
        <div className="mt-3 border-t border-white/15 pt-3">
          <div className="flex">
            <div className="flex min-w-0 flex-1 items-center gap-2 pr-3">
              <IconSchedule className="h-5 w-5 shrink-0 text-navy-100" />
              <div>
                <p className="text-[17px] font-semibold leading-tight">
                  {activeSelectedSessions.length}
                </p>
                <p className="mt-0.5 text-[10px] text-navy-200">
                  Sesi Hari Ini
                </p>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 border-l border-white/15 pl-3">
              <IconClock className="h-5 w-5 shrink-0 text-navy-100" />
              <div>
                <p className="text-[17px] font-semibold leading-tight">
                  {formatHours(totalMinutesSelected)}
                </p>
                <p className="mt-0.5 text-[10px] text-navy-200">Jam Mengajar</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 border-t border-white/15 pt-2">
          {summarySession ? (
            <div className="flex min-h-5 items-center gap-2 text-[11px] text-navy-200">
              <IconSchedule className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                Berikutnya ·{" "}
                {summarySession.subject?.name ||
                  sessionTitle(summarySession) ||
                  "Sesi mengajar"}
                {(summarySession.startTime ||
                  summarySession.schedule?.startTime) &&
                (summarySession.endTime || summarySession.schedule?.endTime)
                  ? ` · ${formatTime(summarySession.startTime || summarySession.schedule!.startTime)}–${formatTime(summarySession.endTime || summarySession.schedule!.endTime)}`
                  : ""}
              </span>
            </div>
          ) : (
            <Link
              href={`/tentor/schedule?date=${selectedDateKey}`}
              className="flex min-h-5 items-center gap-2 text-[11px] text-navy-200 transition-colors hover:text-white active:opacity-75"
            >
              <IconSchedule className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Cekmi tanggal lain untuk lihat jadwal
              </span>
              <IconChevronRight className="h-3.5 w-3.5 shrink-0" />
            </Link>
          )}
        </div>
      </section>

      {/* Navigasi tanggal */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setCalendarMonth(selectedDate);
              setCalendarOpen(true);
            }}
            className="flex min-h-10 items-center gap-1 text-lg font-semibold capitalize text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-700"
          >
            {monthLabel}
            <IconChevronRight className="h-4 w-4 rotate-90" />
          </button>
          <span className="text-xs text-slate-400">
            Minggu ke-{weekOfMonth(selectedDate)}
          </span>
        </div>
        <div className="-mx-4 flex flex-nowrap gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {weekDays.map((d) => {
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
                className={`flex h-[62px] w-[52px] shrink-0 flex-none flex-col items-center justify-center gap-0.5 rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-700 focus-visible:ring-offset-2 ${
                  isSelected
                    ? "border-navy-900 bg-navy-900 text-white ring-2 ring-navy-100"
                    : "border-gray-100 bg-white text-gray-600 hover:border-navy-200 hover:bg-navy-50"
                }`}
              >
                <span className="text-[10px]">{DAY_LABELS[d.getDay()]}</span>
                <span className="text-sm font-semibold leading-none">
                  {d.getDate()}
                </span>
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
      </section>

      {/* Jadwal tanggal terpilih */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-navy-900">
              Jadwal Hari Ini
            </h2>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
              {selectedSessions.length}
            </span>
          </div>
          <Link
            href={`/tentor/schedule?date=${selectedDateKey}`}
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
          <EmptyScheduleState selectedDate={selectedDateKey} />
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
      </section>

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

function EmptyScheduleState({ selectedDate }: { selectedDate: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-6 text-center shadow-sm">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
        <IconSchedule className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-navy-900">
        Belum ada sesi di tanggal ini
      </p>
      <p className="mx-auto mt-1 max-w-[240px] text-xs leading-5 text-slate-400">
        Santaimi dulu. Pilih tanggal lain kalau mau cek jadwal mengajar ta.
      </p>
      <Link
        href={`/tentor/schedule?date=${selectedDate}`}
        className="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[11px] font-semibold text-navy-800 transition hover:border-navy-200 hover:bg-navy-50"
      >
        <IconSchedule className="h-4 w-4 text-blue-600" />
        Buka Kalender Lengkap
      </Link>
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
  const href = s.virtual
    ? `/tentor/schedule?date=${isoDate(new Date(s.sessionDate))}`
    : `/tentor/sessions/${s.id}`;
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
      href={href}
      aria-label={`${s.virtual ? "Lihat jadwal" : "Lihat detail sesi"} ${s.subject?.name || sessionTitle(s) || ""}`}
      className="block cursor-pointer transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-700 focus-visible:ring-offset-2"
    >
      {content}
    </Link>
  );
}
