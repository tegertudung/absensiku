"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import {
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconVideo,
  IconMapPin,
  IconStudent,
  IconWarning,
  IconCheckCircle,
  IconSchedule,
  IconPlus,
} from "@/components/icons";

interface Quota {
  quotaTotal: number;
  quotaRemaining: number;
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
  mode: string;
  location: string | null;
  occurrenceDate?: string | null;
  tutorId?: string | null;
  class: (Quota & { name: string }) | null;
  student: { name: string; packages?: Quota[] } | null;
  subject: { name: string } | null;
}

interface SessionItem {
  id: string;
  scheduleId: string;
  sessionType: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  mode: string | null;
  location: string | null;
  status: string;
  material?: string | null;
  teachingNotes?: string | null;
  progressNotes?: string | null;
  class: (Quota & { name: string }) | null;
  student: { name: string; packages?: Quota[] } | null;
  subject: { name: string } | null;
  schedule: {
    startTime: string;
    endTime: string;
    mode: string;
    location: string | null;
  } | null;
  changeRequests?: Array<{
    id: string;
    proposedDate: string;
    proposedStartTime: string;
    proposedEndTime: string;
    reason: string;
    status: string;
  }>;
}

// One row in a day's agenda — either a real TeachingSession, or a still-"virtual"
// slot derived from a recurring Schedule that hasn't been started for this date yet.
interface AgendaItem {
  key: string;
  scheduleId: string;
  sessionId: string | null;
  sessionType: string;
  status: string; // real session status, or 'SCHEDULED' for a not-yet-started slot
  title: string;
  subtitle: string;
  date: string;
  startTime: string | null; // ISO, combined with the agenda date
  endTime: string | null;
  mode: string;
  location: string | null;
  quota: Quota | null;
  conflict: boolean;
  pendingRequest?: NonNullable<SessionItem["changeRequests"]>[number];
  conflictsWith: Array<{
    title: string;
    subtitle: string;
    startTime: string | null;
    endTime: string | null;
    sessionType: string;
  }>;
  notes?: string | null;
}

const DAY_NAMES = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jum'at",
  "Sabtu",
];
const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "CANCELLED",
  "CANCELLED_NOT_COUNTED",
]);

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfWeek(d: Date) {
  const day = d.getDay();
  return addDays(d, day === 0 ? -6 : 1 - day);
}

function formatTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function timeOfDayMinutes(iso: string | null) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  return d.getHours() * 60 + d.getMinutes();
}

// startTime/endTime on a Schedule are a DateTime combined with an arbitrary
// date — only the time-of-day matters for a recurring weekly slot, so we
// re-combine it onto the agenda date being rendered.
function combineDateTime(date: Date, timeIso: string) {
  const t = new Date(timeIso);
  const d = new Date(date);
  d.setHours(t.getHours(), t.getMinutes(), 0, 0);
  return d.toISOString();
}

function weekRangeLabel(monday: Date) {
  const sunday = addDays(monday, 6);
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: withYear ? "numeric" : undefined,
    });
  return monday.getMonth() === sunday.getMonth() &&
    monday.getFullYear() === sunday.getFullYear()
    ? `${monday.getDate()} – ${fmt(sunday, true)}`
    : `${fmt(monday, false)} – ${fmt(sunday, true)}`;
}

function buildAgenda(
  date: Date,
  schedules: ScheduleItem[],
  sessions: SessionItem[],
): AgendaItem[] {
  const dateKey = isoDate(date);
  const weekday = date.getDay();

  const daySchedules = schedules.filter((s) => {
    if (s.occurrenceDate)
      return isoDate(new Date(s.occurrenceDate)) === dateKey && s.status === "ACTIVE";
    if (s.dayOfWeek !== weekday || s.status !== "ACTIVE") return false;
    if (isoDate(new Date(s.startDate)) > dateKey) return false;
    if (s.endDate && isoDate(new Date(s.endDate)) < dateKey) return false;
    return true;
  });
  const sessionsForDate = sessions.filter(
    (s) => isoDate(new Date(s.sessionDate)) === dateKey,
  );
  const usedScheduleIds = new Set<string>();
  const items: AgendaItem[] = [];

  for (const sch of daySchedules) {
    const real = sessionsForDate.find((s) => s.scheduleId === sch.id);
    if (real) {
      usedScheduleIds.add(sch.id);
      items.push({
        key: real.id,
        scheduleId: sch.id,
        sessionId: real.id,
        sessionType: real.sessionType,
        status: real.status,
        title: real.subject?.name || sch.subject?.name || "Tanpa Mapel",
        subtitle:
          (real.sessionType === "REGULAR"
            ? real.class?.name
            : real.student?.name) || "-",
        date: real.sessionDate,
        startTime:
          real.startTime ??
          real.schedule?.startTime ??
          combineDateTime(date, sch.startTime),
        endTime:
          real.endTime ??
          real.schedule?.endTime ??
          combineDateTime(date, sch.endTime),
        mode: real.mode ?? real.schedule?.mode ?? sch.mode,
        location: real.location ?? real.schedule?.location ?? sch.location,
        quota:
          real.sessionType === "REGULAR"
            ? real.class
            : (real.student?.packages?.[0] ?? null),
        conflict: false,
        pendingRequest: real.changeRequests?.[0],
        conflictsWith: [],
        notes:
          real.sessionType === "PRIVATE"
            ? real.progressNotes
            : real.teachingNotes || real.material,
      });
    } else {
      items.push({
        key: `virtual-${sch.id}`,
        scheduleId: sch.id,
        sessionId: null,
        sessionType: sch.sessionType,
        status: "SCHEDULED",
        title: sch.subject?.name || "Tanpa Mapel",
        subtitle:
          (sch.sessionType === "REGULAR"
            ? sch.class?.name
            : sch.student?.name) || "-",
        date: isoDate(date),
        startTime: combineDateTime(date, sch.startTime),
        endTime: combineDateTime(date, sch.endTime),
        mode: sch.mode,
        location: sch.location,
        quota:
          sch.sessionType === "REGULAR"
            ? sch.class
            : (sch.student?.packages?.[0] ?? null),
        conflict: false,
        conflictsWith: [],
      });
    }
  }

  // A session whose schedule is no longer active/matching today (e.g. edited
  // or deactivated after the session was created) would otherwise vanish —
  // keep it visible instead of silently dropping real history.
  for (const s of sessionsForDate) {
    if (usedScheduleIds.has(s.scheduleId)) continue;
    items.push({
      key: s.id,
      scheduleId: s.scheduleId,
      sessionId: s.id,
      sessionType: s.sessionType,
      status: s.status,
      title: s.subject?.name || "Tanpa Mapel",
      subtitle:
        (s.sessionType === "REGULAR" ? s.class?.name : s.student?.name) || "-",
      date: s.sessionDate,
      startTime: s.startTime ?? s.schedule?.startTime ?? null,
      endTime: s.endTime ?? s.schedule?.endTime ?? null,
      mode: s.mode ?? s.schedule?.mode ?? "OFFLINE",
      location: s.location ?? s.schedule?.location ?? null,
      quota:
        s.sessionType === "REGULAR"
          ? s.class
          : (s.student?.packages?.[0] ?? null),
      conflict: false,
      pendingRequest: s.changeRequests?.[0],
      conflictsWith: [],
      notes:
        s.sessionType === "PRIVATE"
          ? s.progressNotes
          : s.teachingNotes || s.material,
    });
  }

  items.sort(
    (a, b) => timeOfDayMinutes(a.startTime) - timeOfDayMinutes(b.startTime),
  );

  // "Bentrok" — flag overlapping same-day slots that haven't already
  // finished/been cancelled, mirroring the backend's same-tutor conflict rule.
  for (let i = 0; i < items.length; i++) {
    if (TERMINAL_STATUSES.has(items[i].status)) continue;
    for (let j = i + 1; j < items.length; j++) {
      if (TERMINAL_STATUSES.has(items[j].status)) continue;
      const aStart = timeOfDayMinutes(items[i].startTime);
      const aEnd = timeOfDayMinutes(items[i].endTime);
      const bStart = timeOfDayMinutes(items[j].startTime);
      const bEnd = timeOfDayMinutes(items[j].endTime);
      if (aStart < bEnd && bStart < aEnd) {
        items[i].conflict = true;
        items[j].conflict = true;
        items[i].conflictsWith.push({
          title: items[j].title,
          subtitle: items[j].subtitle,
          startTime: items[j].startTime,
          endTime: items[j].endTime,
          sessionType: items[j].sessionType,
        });
        items[j].conflictsWith.push({
          title: items[i].title,
          subtitle: items[i].subtitle,
          startTime: items[i].startTime,
          endTime: items[i].endTime,
          sessionType: items[i].sessionType,
        });
      }
    }
  }

  return items;
}

function statusMeta(status: string, conflict: boolean) {
  if (conflict)
    return {
      label: "Bentrok",
      badge: "bg-red-100 text-red-700",
      card: "border-red-200 bg-red-50/60",
      accent: "text-red-600",
    };
  switch (status) {
    case "SCHEDULED":
      return {
        label: "Terjadwal",
        badge: "bg-blue-100 text-navy-800",
        card: "border-blue-200 bg-blue-50/60",
        accent: "text-navy-800",
      };
    case "IN_PROGRESS":
      return {
        label: "Berlangsung",
        badge: "bg-amber-100 text-amber-700",
        card: "border-amber-200 bg-amber-50/60",
        accent: "text-amber-700",
      };
    case "COMPLETED":
      return {
        label: "Selesai",
        badge: "bg-green-100 text-green-700",
        card: "border-gray-200 bg-white",
        accent: "text-gray-900",
      };
    case "PENDING_ADMIN":
      return {
        label: "Menunggu",
        badge: "bg-amber-100 text-amber-700",
        card: "border-gray-200 bg-white",
        accent: "text-gray-900",
      };
    case "CANCELLED":
    case "CANCELLED_NOT_COUNTED":
      return {
        label: "Dibatalkan",
        badge: "bg-gray-100 text-gray-600",
        card: "border-gray-200 bg-gray-50",
        accent: "text-gray-400",
      };
    default:
      return {
        label: status,
        badge: "bg-gray-100 text-gray-600",
        card: "border-gray-200 bg-white",
        accent: "text-gray-900",
      };
  }
}

function todayISODate() {
  return isoDate(new Date());
}

export default function TentorSchedulePage() {
  const [view, setView] = useState<"DAY" | "WEEK">("DAY");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [requestTarget, setRequestTarget] = useState<AgendaItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<AgendaItem | null>(null);
  const [requestForm, setRequestForm] = useState({
    date: "",
    startTime: "",
    endTime: "",
    reason: "",
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  const rangeStartKey = useMemo(
    () => isoDate(view === "DAY" ? anchorDate : startOfWeek(anchorDate)),
    [view, anchorDate],
  );
  const rangeEndKey = useMemo(
    () =>
      isoDate(
        view === "DAY" ? anchorDate : addDays(startOfWeek(anchorDate), 6),
      ),
    [view, anchorDate],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schedRes, sessRes] = await Promise.all([
        api.get("/schedules"),
        api.get("/sessions", {
          params: { startDate: rangeStartKey, endDate: rangeEndKey },
        }),
      ]);
      setSchedules(schedRes.data.data);
      setSessions(sessRes.data.data);
    } catch {
      setActionError("Gagal memuat data jadwal.");
    } finally {
      setLoading(false);
    }
  }, [rangeStartKey, rangeEndKey]);

  useEffect(() => {
    load();
  }, [load]);

  const dayAgenda = useMemo(
    () => buildAgenda(anchorDate, schedules, sessions),
    [anchorDate, schedules, sessions],
  );
  const stripDays = useMemo(
    () =>
      Array.from({ length: 11 }, (_, index) => addDays(anchorDate, index - 3)),
    [anchorDate],
  );

  async function startSession(scheduleId: string, dateKey: string) {
    setActionError(null);
    setBusyId(scheduleId);
    try {
      await api.post("/sessions", { scheduleId, sessionDate: dateKey });
      await load();
    } catch (err: any) {
      const message = err.response?.data?.message || "Gagal memulai sesi.";
      if (message.includes("belum dilengkapi")) {
        window.location.assign(`/tentor/sessions/direct?scheduleId=${scheduleId}&sessionDate=${dateKey}`);
        return;
      }
      setActionError(message);
    } finally {
      setBusyId(null);
    }
  }

  async function completeSession(sessionId: string) {
    setActionError(null);
    setBusyId(sessionId);
    try {
      await api.post(`/sessions/${sessionId}/complete`);
      await load();
    } catch (err: any) {
      setActionError(
        err.response?.data?.message || "Gagal menyelesaikan sesi.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function submitCancellation() {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 3) {
      setActionError("Alasan pembatalan minimal 3 karakter.");
      return;
    }
    setActionError(null);
    setBusyId(cancelTarget);
    try {
      await api.post(`/sessions/${cancelTarget}/cancel`, {
        reason: cancelReason.trim(),
      });
      setCancelTarget(null);
      setCancelReason("");
      await load();
    } catch (err: any) {
      setActionError(
        err.response?.data?.message || "Gagal melaporkan pembatalan.",
      );
    } finally {
      setBusyId(null);
    }
  }
  function openChangeRequest(item: AgendaItem) {
    if (!item.sessionId || !item.startTime || !item.endTime) return;
    setActionError(null);
    setRequestTarget(item);
    setRequestForm({
      date: isoDate(anchorDate),
      startTime: formatTime(item.startTime),
      endTime: formatTime(item.endTime),
      reason: "",
    });
  }
  async function submitChangeRequest() {
    if (!requestTarget?.sessionId) return;
    if (
      !requestForm.reason.trim() ||
      requestForm.startTime >= requestForm.endTime
    )
      return setActionError("Lengkapi waktu yang valid dan alasan perubahan.");
    setBusyId(requestTarget.sessionId);
    try {
      await api.post(`/sessions/${requestTarget.sessionId}/change-requests`, {
        proposedDate: requestForm.date,
        proposedStartTime: requestForm.startTime,
        proposedEndTime: requestForm.endTime,
        reason: requestForm.reason.trim(),
      });
      setRequestTarget(null);
      await load();
    } catch (err: any) {
      setActionError(
        err.response?.data?.message || "Gagal mengirim pengajuan.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
        Jadwal Saya
      </h1>
      {actionError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {actionError}
        </p>
      )}

      <div className="flex rounded-xl bg-gray-100 p-1">
        <button
          onClick={() => setView("DAY")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            view === "DAY" ? "bg-navy-900 text-white" : "text-gray-500"
          }`}
        >
          Hari
        </button>
        <button
          onClick={() => setView("WEEK")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            view === "WEEK" ? "bg-navy-900 text-white" : "text-gray-500"
          }`}
        >
          Minggu
        </button>
      </div>

      {view === "DAY" ? (
        <>
          <div>
            <button
              type="button"
              onClick={() => {
                setCalendarMonth(anchorDate);
                setCalendarOpen(true);
              }}
              className="mx-auto flex min-h-10 items-center gap-1 text-sm font-semibold capitalize text-navy-900"
            >
              {anchorDate.toLocaleDateString("id-ID", {
                month: "long",
                year: "numeric",
              })}
              <IconChevronRight className="h-4 w-4 rotate-90" />
            </button>
            <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {stripDays.map((day) => {
                const selected = isoDate(day) === rangeStartKey;
                const hasSchedule =
                  buildAgenda(day, schedules, sessions).length > 0;
                return (
                  <button
                    key={isoDate(day)}
                    onClick={() => setAnchorDate(day)}
                    aria-pressed={selected}
                    className={`flex h-[92px] w-[56px] shrink-0 snap-center flex-col items-center justify-center gap-1 rounded-xl border text-sm ${selected ? "border-navy-900 bg-navy-900 text-white" : "border-gray-100 bg-white text-gray-700"}`}
                  >
                    <span className="text-[11px]">
                      {DAY_NAMES[day.getDay()].slice(0, 3)}
                    </span>
                    <span className="font-semibold">{day.getDate()}</span>
                    {hasSchedule ? (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${selected ? "bg-white" : "bg-blue-600"}`}
                      />
                    ) : (
                      <span className="h-1.5 w-1.5" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-4">
              <p className="text-base font-semibold text-navy-900">
                {DAY_NAMES[anchorDate.getDay()]},{" "}
                {anchorDate.toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                })}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {dayAgenda.length === 0
                  ? "Tidak ada sesi"
                  : `${dayAgenda.length} sesi`}
              </p>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-gray-400">Memuat jadwal...</p>
          ) : dayAgenda.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center">
              <p className="text-sm text-gray-400">
                Tidak ada jadwal pada hari ini.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayAgenda.map((item) => (
                <AgendaCard
                  key={item.key}
                  item={item}
                  isToday={rangeStartKey === todayISODate()}
                  busy={
                    busyId !== null &&
                    (busyId === item.sessionId || busyId === item.scheduleId)
                  }
                  onStart={() => startSession(item.scheduleId, rangeStartKey)}
                  onComplete={() =>
                    item.sessionId && completeSession(item.sessionId)
                  }
                  onCancelRequest={() =>
                    item.sessionId && setCancelTarget(item.sessionId)
                  }
                  onChangeRequest={() => openChangeRequest(item)}
                  onDetail={() => item.sessionId && setSelectedItem(item)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <WeekAgenda
          anchorDate={anchorDate}
          setAnchorDate={setAnchorDate}
          schedules={schedules}
          sessions={sessions}
          loading={loading}
          busyId={busyId}
          onStart={startSession}
          onComplete={completeSession}
          onCancelRequest={setCancelTarget}
          onDetail={(item) => item.sessionId && setSelectedItem(item)}
          onChangeRequest={openChangeRequest}
        />
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-4">
            <h3 className="mb-2 text-sm font-medium text-gray-900">
              Laporkan Pembatalan Hari-H
            </h3>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              rows={3}
              placeholder="Alasan pembatalan (min. 3 karakter)"
            />
            <div className="flex gap-2">
              <button
                onClick={submitCancellation}
                disabled={busyId === cancelTarget}
                className="flex-1 rounded-md bg-red-600 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                Kirim
              </button>
              <button
                onClick={() => {
                  setCancelTarget(null);
                  setCancelReason("");
                }}
                className="flex-1 rounded-md border border-gray-200 py-2 text-xs font-medium text-gray-600"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
      {requestTarget && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/40">
          <div className="w-full rounded-t-2xl bg-white p-5">
            <h3 className="text-base font-semibold text-navy-900">
              Ajukan Perubahan Jadwal
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Jadwal saat ini tetap berlaku sampai Admin meninjau pengajuan.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="col-span-2 text-sm">
                Tanggal yang Diusulkan
                <input
                  type="date"
                  value={requestForm.date}
                  onChange={(e) =>
                    setRequestForm({ ...requestForm, date: e.target.value })
                  }
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
              <label className="text-sm">
                Jam Mulai
                <input
                  type="time"
                  value={requestForm.startTime}
                  onChange={(e) =>
                    setRequestForm({
                      ...requestForm,
                      startTime: e.target.value,
                    })
                  }
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
              <label className="text-sm">
                Jam Selesai
                <input
                  type="time"
                  value={requestForm.endTime}
                  onChange={(e) =>
                    setRequestForm({ ...requestForm, endTime: e.target.value })
                  }
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
            </div>
            <label className="mt-3 block text-sm">
              Alasan *
              <textarea
                value={requestForm.reason}
                onChange={(e) =>
                  setRequestForm({ ...requestForm, reason: e.target.value })
                }
                rows={3}
                placeholder="Jelaskan alasan perubahan jadwal."
                className="mt-1 w-full rounded border p-2"
              />
            </label>
            {actionError && (
              <p className="mt-2 text-sm text-red-600">{actionError}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setRequestTarget(null)}
                className="flex-1 rounded border py-2"
              >
                Batal
              </button>
              <button
                onClick={submitChangeRequest}
                disabled={busyId === requestTarget.sessionId}
                className="flex-1 rounded bg-navy-900 py-2 text-white"
              >
                Kirim Pengajuan
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedItem && (
        <SessionDetailSheet
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onRequest={() => {
            setSelectedItem(null);
            openChangeRequest(selectedItem);
          }}
        />
      )}
      <Link
        href="/tentor/private/new"
        aria-label="Tambah Jadwal Privat"
        className="fixed bottom-20 right-4 z-30 flex h-11 items-center gap-2 rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white shadow-md transition duration-150 hover:bg-navy-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-700 focus-visible:ring-offset-2 active:scale-[0.97] active:shadow-sm"
      >
        <IconPlus className="h-4 w-4" />
        Privat
      </Link>
      {calendarOpen && (
        <ScheduleCalendarSheet
          month={calendarMonth}
          setMonth={setCalendarMonth}
          selectedDate={rangeStartKey}
          schedules={schedules}
          sessions={sessions}
          onClose={() => setCalendarOpen(false)}
          onSelect={(date) => {
            setAnchorDate(date);
            setCalendarOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ScheduleCalendarSheet({
  month,
  setMonth,
  selectedDate,
  schedules,
  sessions,
  onClose,
  onSelect,
}: {
  month: Date;
  setMonth: (date: Date) => void;
  selectedDate: string;
  schedules: ScheduleItem[];
  sessions: SessionItem[];
  onClose: () => void;
  onSelect: (date: Date) => void;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-slate-950/40"
      role="dialog"
      aria-modal="true"
      aria-label="Pilih Tanggal"
    >
      <div className="w-full rounded-t-3xl bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-200" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-navy-900">
            Pilih Tanggal
          </h2>
          <button onClick={onClose} className="text-sm text-gray-500">
            Tutup
          </button>
        </div>
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
            className="flex h-10 w-10 items-center justify-center"
          >
            <IconChevronLeft className="h-5 w-5" />
          </button>
          <p className="text-sm font-semibold capitalize">
            {month.toLocaleDateString("id-ID", {
              month: "long",
              year: "numeric",
            })}
          </p>
          <button
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
            className="flex h-10 w-10 items-center justify-center"
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
            const hasSchedule =
              buildAgenda(day, schedules, sessions).length > 0;
            return (
              <button
                key={key}
                onClick={() => onSelect(day)}
                className={`mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-full text-sm ${selected ? "bg-blue-600 text-white" : day.getMonth() === month.getMonth() ? "text-navy-900" : "text-gray-300"}`}
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

function SessionDetailSheet({
  item,
  onClose,
  onRequest,
}: {
  item: AgendaItem;
  onClose: () => void;
  onRequest: () => void;
}) {
  const mayRequest =
    !!item.sessionId &&
    ["SCHEDULED", "IN_PROGRESS"].includes(item.status) &&
    !item.pendingRequest;
  const isReadOnly = TERMINAL_STATUSES.has(item.status);
  const status = statusMeta(item.status, item.conflict).label;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-slate-950/40"
      role="dialog"
      aria-modal="true"
      aria-label="Detail pertemuan"
      onClick={onClose}
    >
      <section
        className="w-full rounded-t-3xl bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-200" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-navy-900">Detail Pertemuan</p>
            <p className="mt-0.5 text-sm text-gray-500">{item.title}</p>
          </div>
          <button onClick={onClose} className="text-sm text-gray-500">Tutup</button>
        </div>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Kelas / Siswa</dt><dd className="text-right font-medium text-gray-900">{item.subtitle}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Tanggal</dt><dd className="text-right font-medium text-gray-900">{new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date(`${item.date.slice(0, 10)}T00:00:00`))}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Waktu</dt><dd className="text-right font-medium text-gray-900">{formatTime(item.startTime)}–{formatTime(item.endTime)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Program</dt><dd className="text-right font-medium text-gray-900">{item.sessionType === "PRIVATE" ? "Privat" : "Reguler"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Mata Pelajaran</dt><dd className="text-right font-medium text-gray-900">{item.title}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Lokasi</dt><dd className="text-right font-medium text-gray-900">{item.mode === "ONLINE" ? "Online" : item.location || "Offline"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Status</dt><dd className="text-right font-medium text-gray-900">{status}</dd></div>
        </dl>
        {item.conflict && (
          <>
          <div className="mt-4 flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            <IconWarning className="h-4 w-4 shrink-0" />
            Jadwal ini bertumpang tindih dengan pertemuan lain. Ajukan perubahan bila diperlukan.
          </div>
          <div className="mt-2 space-y-1.5 text-sm text-red-800">
            {item.conflictsWith.map((session) => (
              <p key={`${session.startTime}-${session.title}`}>
                {formatTime(session.startTime)}-{formatTime(session.endTime)} · {session.subtitle} · {session.title} · {session.sessionType === "PRIVATE" ? "Privat" : "Reguler"}
              </p>
            ))}
          </div>
          </>
        )}
        {item.pendingRequest && (
          <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-semibold">Pengajuan perubahan menunggu Admin</p>
            <p className="mt-1">Usulan: {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(item.pendingRequest.proposedDate))}, {formatTime(item.pendingRequest.proposedStartTime)}–{formatTime(item.pendingRequest.proposedEndTime)}</p>
            <p className="mt-1 text-xs">{item.pendingRequest.reason}</p>
          </div>
        )}
        {isReadOnly && <p className="mt-4 text-sm text-gray-500">Sesi ini bersifat riwayat dan tidak dapat diubah.</p>}
        {isReadOnly && item.notes && (
          <div className="mt-3 text-sm"><p className="text-gray-500">Catatan</p><p className="mt-1 whitespace-pre-wrap text-gray-900">{item.notes}</p></div>
        )}
        {mayRequest && (
          <button onClick={onRequest} className="mt-5 w-full rounded-xl bg-navy-900 py-3 text-sm font-semibold text-white">
            Ajukan Perubahan Jadwal
          </button>
        )}
      </section>
    </div>
  );
}

function WeekAgenda({
  anchorDate,
  setAnchorDate,
  schedules,
  sessions,
  loading,
  busyId,
  onStart,
  onComplete,
  onCancelRequest,
  onDetail,
  onChangeRequest,
}: {
  anchorDate: Date;
  setAnchorDate: (fn: (d: Date) => Date) => void;
  schedules: ScheduleItem[];
  sessions: SessionItem[];
  loading: boolean;
  busyId: string | null;
  onStart: (scheduleId: string, dateKey: string) => void;
  onComplete: (sessionId: string) => void;
  onCancelRequest: (sessionId: string) => void;
  onDetail: (item: AgendaItem) => void;
  onChangeRequest: (item: AgendaItem) => void;
}) {
  const monday = startOfWeek(anchorDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const today = todayISODate();

  return (
    <>
      <div className="flex items-center justify-between">
        <button
          onClick={() => setAnchorDate((d) => addDays(d, -7))}
          aria-label="Minggu sebelumnya"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50"
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-gray-900">
          {weekRangeLabel(monday)}
        </p>
        <button
          onClick={() => setAnchorDate((d) => addDays(d, 7))}
          aria-label="Minggu berikutnya"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50"
        >
          <IconChevronRight className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Memuat jadwal...</p>
      ) : (
        <div className="space-y-5">
          {days.map((day) => {
            const dateKey = isoDate(day);
            const agenda = buildAgenda(day, schedules, sessions);
            const isToday = dateKey === today;
            return (
              <div key={dateKey}>
                <div className="mb-2 flex items-center gap-2">
                  <p
                    className={`text-sm font-semibold ${isToday ? "text-navy-900" : "text-gray-700"}`}
                  >
                    {DAY_NAMES[day.getDay()]},{" "}
                    {day.toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "long",
                    })}
                  </p>
                  {isToday && (
                    <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[10px] font-medium text-navy-800">
                      Hari ini
                    </span>
                  )}
                </div>
                {agenda.length === 0 ? (
                  <p className="text-xs text-gray-400">Tidak ada jadwal.</p>
                ) : (
                  <div className="space-y-2">
                    {agenda.map((item) => (
                      <AgendaCard
                        key={item.key}
                        item={item}
                        isToday={isToday}
                        busy={
                          busyId !== null &&
                          (busyId === item.sessionId ||
                            busyId === item.scheduleId)
                        }
                        onStart={() => onStart(item.scheduleId, dateKey)}
                        onComplete={() =>
                          item.sessionId && onComplete(item.sessionId)
                        }
                        onCancelRequest={() =>
                          item.sessionId && onCancelRequest(item.sessionId)
                        }
                        onDetail={() => item.sessionId && onDetail(item)}
                        onChangeRequest={() => onChangeRequest(item)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function AgendaCard({
  item,
  isToday,
  busy,
  onStart,
  onComplete,
  onCancelRequest,
  onChangeRequest,
  onDetail,
}: {
  item: AgendaItem;
  isToday: boolean;
  busy: boolean;
  onStart: () => void;
  onComplete: () => void;
  onCancelRequest: () => void;
  onChangeRequest?: () => void;
  onDetail?: () => void;
}) {
  const meta = statusMeta(item.status, item.conflict);
  const minutes =
    item.startTime && item.endTime
      ? Math.max(
          0,
          Math.round(
            (new Date(item.endTime).getTime() -
              new Date(item.startTime).getTime()) /
              60000,
          ),
        )
      : null;
  const isEmpty = item.quota != null && item.quota.quotaRemaining === 0;
  const canStart =
    item.status === "SCHEDULED" && !item.sessionId && isToday && !item.conflict;
  const canAct = item.status === "IN_PROGRESS" && !!item.sessionId;

  return (
    <div
      className={`rounded-2xl border p-4 ${meta.card} ${item.sessionId ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-700" : ""}`}
      role={item.sessionId ? "button" : undefined}
      tabIndex={item.sessionId ? 0 : undefined}
      onClick={onDetail}
      onKeyDown={(event) => {
        if (item.sessionId && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onDetail?.();
        }
      }}
    >
      <div className="flex gap-3">
        <div className={`w-14 shrink-0 text-sm font-semibold ${meta.accent}`}>
          <p>{formatTime(item.startTime)}</p>
          <p className="mt-0.5 text-xs font-normal opacity-60">
            {formatTime(item.endTime)}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`truncate text-sm font-semibold ${item.conflict ? "text-red-700" : "text-gray-900"}`}
            >
              {item.title}
            </p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}
            >
              {meta.label}
            </span>
          </div>
          <p
            className={`truncate text-xs ${item.conflict ? "text-red-600" : "text-gray-500"}`}
          >
            {item.subtitle}
          </p>

          {item.conflict ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
              <IconWarning className="h-3.5 w-3.5 shrink-0" /> Jadwal tumpang
              tindih
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                {item.mode === "ONLINE" ? (
                  <IconVideo className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <IconMapPin className="h-3.5 w-3.5 shrink-0" />
                )}
                {item.mode === "ONLINE"
                  ? "Online"
                  : item.location
                    ? `Offline - ${item.location}`
                    : "Offline"}
              </span>
              <span className="flex items-center gap-1.5">
                {item.sessionType === "PRIVATE" ? (
                  <IconStudent className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <IconClock className="h-3.5 w-3.5 shrink-0" />
                )}
                {item.sessionType === "PRIVATE" ? "Privat" : `${minutes} Menit`}
              </span>
            </div>
          )}

          {isEmpty && item.status === "SCHEDULED" && (
            <div className="mt-2.5 flex gap-1.5 rounded-lg bg-red-100/70 px-2.5 py-2">
              <IconWarning className="h-3.5 w-3.5 shrink-0 text-red-600" />
              <p className="text-[11px] text-red-700">
                {item.sessionType === "REGULAR"
                  ? "Pertemuan kelas habis."
                  : "Paket pertemuan habis."}{" "}
                Hubungi Admin.
              </p>
            </div>
          )}

          {canStart && !isEmpty && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onStart();
              }}
              disabled={busy}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-navy-900 py-2.5 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60"
            >
              <IconCheckCircle className="h-4 w-4" />{" "}
              {busy ? "Memulai..." : "Mulai Kelas"}
            </button>
          )}

          {item.status === "COMPLETED" && item.sessionId && (
            <Link
              href={`/tentor/sessions/${item.sessionId}`}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Lihat detail sesi ${item.title}`}
              className="mt-3 flex items-center justify-between rounded-xl bg-green-50 px-3 py-2.5 text-sm font-medium text-green-700 transition hover:bg-green-100"
            >
              <span className="flex items-center gap-1.5">
                <IconCheckCircle className="h-4 w-4" />
                Selesai
              </span>
              <IconChevronRight className="h-4 w-4" />
            </Link>
          )}

          {canAct && (
            <div className="mt-3 space-y-2">
              <Link
                href={`/tentor/sessions/${item.sessionId}`}
                onClick={(event) => event.stopPropagation()}
                className="block rounded-xl border border-navy-200 py-2.5 text-center text-sm font-medium text-navy-900 hover:bg-navy-50"
              >
                Isi Catatan Sesi
              </Link>
              {item.sessionType === "REGULAR" && (
                <Link
                  href={`/tentor/sessions/${item.sessionId}/attendance`}
                  onClick={(event) => event.stopPropagation()}
                  className="block rounded-xl border border-navy-200 py-2.5 text-center text-sm font-medium text-navy-900 hover:bg-navy-50"
                >
                  Isi Absensi Siswa
                </Link>
              )}
              <div className="flex gap-2">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onComplete();
                  }}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-navy-900 py-2.5 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60"
                >
                  {busy ? "Memproses..." : "Selesaikan"}
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onCancelRequest();
                  }}
                  disabled={busy}
                  className="flex-1 rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 disabled:opacity-60"
                >
                  Laporkan Pembatalan
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
