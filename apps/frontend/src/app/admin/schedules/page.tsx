"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import Modal from "@/components/Modal";
import PageHeader from "@/components/PageHeader";
import SectionCard from "@/components/SectionCard";
import EmptyState from "@/components/EmptyState";
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
} from "@/components/icons";

type Option = { id: string; name: string; status?: string; isActive?: boolean };
type Pattern = {
  id: string;
  classId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  class: { name: string } | null;
};
type Meeting = {
  id: string;
  sessionType: string;
  classId: string | null;
  studentId: string | null;
  scheduleId: string | null;
  patternOccurrenceDate: string | null;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  mode: string;
  location: string | null;
  teachingNotes: string | null;
  progressNotes: string | null;
  tutor: { id: string; name: string };
  subject: { id: string; name: string } | null;
  class: { name: string } | null;
  student: { name: string } | null;
  changeRequests?: Array<{
    id: string;
    proposedDate: string;
    proposedStartTime: string;
    proposedEndTime: string;
    reason: string;
    status: string;
  }>;
};
type Legacy = {
  id: string;
  sessionType: string;
  classId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  class: { name: string } | null;
  student: { name: string } | null;
  tutor: { name: string } | null;
  subject: { name: string } | null;
  mode: string;
  location: string | null;
  isPattern: boolean;
};
type CalendarItem = {
  id: string;
  date: Date;
  start: string;
  end: string;
  sessionType: "REGULAR" | "PRIVATE";
  label: string;
  tutor?: string;
  tutorId?: string;
  subject?: string;
  status: string;
  mode?: string;
  location?: string | null;
  classId?: string;
  patternId?: string;
  patternOccurrenceDate?: string;
  incomplete?: boolean;
  calendarState:
    "INCOMPLETE" | "WAITING_NOTE" | "NOTE_FILLED" | "COMPLETED" | "CANCELLED";
  meeting?: Meeting;
};
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const monday = (date: Date) => addDays(date, -((date.getDay() + 6) % 7));
const time = (value: string | null) =>
  value
    ? `${pad(new Date(value).getHours())}:${pad(new Date(value).getMinutes())}`
    : "";
const slotKey = (classId: string, date: Date, start: string, end: string) =>
  `${classId}:${iso(date)}:${start}:${end}`;
const getCalendarState = (meeting: Meeting): CalendarItem["calendarState"] => {
  if (meeting.status === "CANCELLED_NOT_COUNTED") return "CANCELLED";
  if (meeting.status === "COMPLETED") return "COMPLETED";
  const hasNote =
    meeting.sessionType === "PRIVATE"
      ? Boolean(meeting.progressNotes?.trim())
      : Boolean(meeting.teachingNotes?.trim());
  return hasNote ? "NOTE_FILLED" : "WAITING_NOTE";
};
const calendarStateLabel = (item: CalendarItem) =>
  item.calendarState === "INCOMPLETE"
    ? "Belum dilengkapi"
    : item.calendarState === "WAITING_NOTE"
      ? "Menunggu catatan"
      : item.calendarState === "NOTE_FILLED"
        ? "Catatan diisi"
        : item.calendarState === "CANCELLED"
          ? "Dibatalkan"
          : "Selesai";

export default function AdminSchedulesPage() {
  const [week, setWeek] = useState(() => monday(new Date()));
  const [view, setView] = useState<"WEEK" | "LIST">("WEEK");
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [legacy, setLegacy] = useState<Legacy[]>([]);
  const [tutors, setTutors] = useState<Option[]>([]);
  const [eligibleTutors, setEligibleTutors] = useState<Option[]>([]);
  const [classes, setClasses] = useState<Option[]>([]);
  const [students, setStudents] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [patternOpen, setPatternOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarItem | null>(null);
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [dayDate, setDayDate] = useState<Date | null>(null);
  const [cancelItem, setCancelItem] = useState<CalendarItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [deleteItem, setDeleteItem] = useState<CalendarItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const [tutorQuery, setTutorQuery] = useState("");
  const [filter, setFilter] = useState({ program: "", tutor: "", status: "" });
  const [patternClassId, setPatternClassId] = useState("");
  const [slots, setSlots] = useState([
    { dayOfWeek: "2", startTime: "16:00", endTime: "17:30" },
  ]);
  const freshMeeting = () => ({
    sessionType: "REGULAR",
    classId: "",
    studentId: "",
    tutorId: "",
    subjectId: "",
    sessionDate: iso(week),
    startTime: "16:00",
    endTime: "17:30",
    mode: "OFFLINE",
    location: "",
    patternId: "",
    patternOccurrenceDate: "",
  });
  const [form, setForm] = useState(freshMeeting);
  const weekEnd = useMemo(() => addDays(week, 6), [week]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [
        patternRes,
        meetingRes,
        legacyRes,
        tutorRes,
        classRes,
        studentRes,
        subjectRes,
      ] = await Promise.all([
        api.get("/schedules/patterns"),
        api.get(`/sessions?startDate=${iso(week)}&endDate=${iso(weekEnd)}`),
        api.get("/schedules"),
        api.get("/tutors"),
        api.get("/classes"),
        api.get("/students"),
        api.get("/subjects"),
      ]);
      setPatterns(patternRes.data.data);
      setMeetings(meetingRes.data.data);
      setLegacy(legacyRes.data.data.filter((row: Legacy) => !row.isPattern));
      setTutors(tutorRes.data.data);
      setClasses(
        classRes.data.data.filter((row: Option) => row.status !== "INACTIVE"),
      );
      setStudents(
        studentRes.data.data.filter((row: Option) => row.status === "ACTIVE"),
      );
      setSubjects(
        subjectRes.data.data.filter((row: Option) => row.isActive !== false),
      );
    } catch {
      setLoadError("Gagal memuat kalender jadwal.");
    } finally {
      setLoading(false);
    }
  }, [week, weekEnd]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!form.subjectId) {
      setEligibleTutors([]);
      return;
    }
    api
      .get(`/tutors?subjectId=${form.subjectId}`)
      .then((response) => {
        const next: Option[] = response.data.data;
        setEligibleTutors(next);
        if (form.tutorId && !next.some((tutor) => tutor.id === form.tutorId))
          setForm((current) => ({ ...current, tutorId: "" }));
      })
      .catch(() => setEligibleTutors([]));
  }, [form.subjectId]);

  const items = useMemo(() => {
    const actual: CalendarItem[] = meetings
      .filter((meeting) => meeting.startTime && meeting.endTime)
      .map((meeting) => ({
        id: meeting.id,
        date: new Date(`${meeting.sessionDate.slice(0, 10)}T00:00:00`),
        start: time(meeting.startTime),
        end: time(meeting.endTime),
        sessionType: meeting.sessionType as "REGULAR" | "PRIVATE",
        label: meeting.class?.name || meeting.student?.name || "-",
        tutor: meeting.tutor.name,
        tutorId: meeting.tutor.id,
        subject: meeting.subject?.name,
        status: meeting.status,
        mode: meeting.mode,
        location: meeting.location,
        classId: meeting.classId || undefined,
        patternId: meeting.scheduleId || undefined,
        patternOccurrenceDate: meeting.patternOccurrenceDate?.slice(0, 10),
        calendarState: getCalendarState(meeting),
        meeting,
      }));
    const actualRegularSlots = new Set(
      actual
        .filter((item) => item.sessionType === "REGULAR" && item.classId)
        .map((item) => slotKey(item.classId!, item.date, item.start, item.end)),
    );
    const handledPatternOccurrences = new Set(
      actual
        .filter((item) => item.patternId && item.patternOccurrenceDate)
        .map((item) => `${item.patternId}:${item.patternOccurrenceDate}`),
    );
    const legacyItems: CalendarItem[] = legacy
      .filter(
        (row) =>
          row.sessionType !== "REGULAR" ||
          !patterns.some((pattern) => pattern.classId === row.classId),
      )
      .flatMap(
        (row) =>
          Array.from({ length: 7 }, (_, offset) => {
            const date = addDays(week, offset);
            if (date.getDay() !== row.dayOfWeek) return null;
            return {
              id: `${row.id}-${iso(date)}`,
              date,
              start: time(row.startTime),
              end: time(row.endTime),
              sessionType: row.sessionType as "REGULAR" | "PRIVATE",
              label: row.class?.name || row.student?.name || "-",
              tutor: row.tutor?.name,
              subject: row.subject?.name,
              status: "SCHEDULED",
              mode: row.mode,
              location: row.location,
              classId: row.classId || undefined,
              calendarState: "WAITING_NOTE",
            };
          }).filter(Boolean) as CalendarItem[],
      );
    const compatibleLegacy = legacyItems.filter(
      (item) =>
        item.sessionType !== "REGULAR" ||
        !item.classId ||
        !actualRegularSlots.has(
          slotKey(item.classId, item.date, item.start, item.end),
        ),
    );
    const existing = [...actual, ...compatibleLegacy];
    const incomplete: CalendarItem[] = patterns.flatMap(
      (pattern) =>
        Array.from({ length: 7 }, (_, offset) => {
          const date = addDays(week, offset);
          if (
            date.getDay() !== pattern.dayOfWeek ||
            handledPatternOccurrences.has(`${pattern.id}:${iso(date)}`) ||
            actualRegularSlots.has(
              slotKey(
                pattern.classId,
                date,
                time(pattern.startTime),
                time(pattern.endTime),
              ),
            )
          )
            return null;
          return {
            id: `pattern-${pattern.id}-${iso(date)}`,
            date,
            start: time(pattern.startTime),
            end: time(pattern.endTime),
            sessionType: "REGULAR",
            label: pattern.class?.name || "Kelas",
            status: "INCOMPLETE",
            classId: pattern.classId,
            patternId: pattern.id,
            patternOccurrenceDate: iso(date),
            incomplete: true,
            calendarState: "INCOMPLETE",
          };
        }).filter(Boolean) as CalendarItem[],
    );
    return [...existing, ...incomplete]
      .filter(
        (item) =>
          (!filter.program || item.sessionType === filter.program) &&
          (!filter.tutor || item.tutorId === filter.tutor) &&
          (!filter.status || item.calendarState === filter.status),
      )
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [meetings, legacy, patterns, week, filter, tutors]);

  function openMeeting(prefill?: CalendarItem) {
    setMutationError("");
    setStudentQuery("");
    setTutorQuery("");
    setForm(
      prefill
        ? {
            ...freshMeeting(),
            sessionType: "REGULAR",
            classId: prefill.classId || "",
            patternId: prefill.patternId || "",
            patternOccurrenceDate: prefill.patternOccurrenceDate || "",
            sessionDate: iso(prefill.date),
            startTime: prefill.start,
            endTime: prefill.end,
          }
        : freshMeeting(),
    );
    setMeetingOpen(true);
  }
  function openEdit(item: CalendarItem) {
    if (!item.meeting) return;
    setMutationError("");
    setEditing(item);
    setStudentQuery("");
    setTutorQuery("");
    setForm({
      ...freshMeeting(),
      sessionType: item.sessionType,
      classId: item.meeting.classId || "",
      studentId: item.meeting.studentId || "",
      tutorId: item.meeting.tutor.id,
      subjectId: item.meeting.subject?.id || "",
      sessionDate: iso(item.date),
      startTime: item.start,
      endTime: item.end,
      mode: item.mode || "OFFLINE",
      location: item.location || "",
      patternId: item.patternId || "",
      patternOccurrenceDate: item.patternOccurrenceDate || "",
    });
    setMeetingOpen(true);
  }
  async function savePattern(event: React.FormEvent) {
    event.preventDefault();
    setMutationError("");
    if (!patternClassId)
      return setMutationError("Pilih kelas terlebih dahulu.");
    setSaving(true);
    try {
      await api.put(`/schedules/patterns/${patternClassId}`, {
        slots: slots.map((slot) => ({
          ...slot,
          dayOfWeek: Number(slot.dayOfWeek),
        })),
      });
      setPatternOpen(false);
      await load();
    } catch (error: any) {
      setMutationError(
        error.response?.data?.message || "Gagal menyimpan pola jadwal.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveMeeting(event: React.FormEvent) {
    event.preventDefault();
    setMutationError("");
    if (
      !form.tutorId ||
      !form.subjectId ||
      (form.sessionType === "REGULAR" && !form.classId) ||
      (form.sessionType === "PRIVATE" && !form.studentId)
    )
      return setMutationError("Lengkapi kelas/siswa, mapel, dan tentor.");
    setSaving(true);
    try {
      const payload = {
        ...form,
        patternId: form.patternId || undefined,
        patternOccurrenceDate: form.patternOccurrenceDate || undefined,
        classId: form.sessionType === "REGULAR" ? form.classId : undefined,
        studentId: form.sessionType === "PRIVATE" ? form.studentId : undefined,
        location:
          form.mode === "OFFLINE" ? form.location || undefined : undefined,
      };
      if (editing) {
        await api.put(`/schedules/meetings/${editing.id}`, payload);
      } else {
        await api.post("/schedules/meetings", payload);
      }
      setFilter({ program: "", tutor: "", status: "" });
      await load();
      setMeetingOpen(false);
      setEditing(null);
    } catch (error: any) {
      setMutationError(
        error.response?.data?.message || "Gagal menyimpan pertemuan.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function cancelMeeting() {
    if (!cancelItem?.meeting || cancelReason.trim().length < 3) {
      return setMutationError("Alasan pembatalan minimal 3 karakter.");
    }
    setCancelling(true);
    setMutationError("");
    try {
      await api.post(`/sessions/${cancelItem.id}/admin-cancel`, {
        reason: cancelReason.trim(),
      });
      setCancelItem(null);
      setSelected(null);
      setCancelReason("");
      await load();
    } catch (error: any) {
      setMutationError(
        error.response?.data?.message || "Gagal membatalkan pertemuan.",
      );
    } finally {
      setCancelling(false);
    }
  }
  async function deleteMeeting() {
    if (!deleteItem) return;
    setDeleting(true);
    setMutationError("");
    try {
      await api.delete(`/schedules/meetings/${deleteItem.id}`);
      setDeleteItem(null);
      setSelected(null);
      await load();
    } catch (error: any) {
      setMutationError(
        error.response?.data?.message || "Gagal menghapus pertemuan.",
      );
    } finally {
      setDeleting(false);
    }
  }
  const selectedPatternSlots = patterns
    .filter((item) => item.classId === patternClassId)
    .map((item) => ({
      dayOfWeek: String(item.dayOfWeek),
      startTime: time(item.startTime),
      endTime: time(item.endTime),
    }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Jadwal"
        description="Kelola pola kelas dan pertemuan mengajar Pioner Class."
        action={
          <div className="flex gap-2">
            <button
              onClick={() => {
                setPatternClassId("");
                setSlots([
                  { dayOfWeek: "2", startTime: "16:00", endTime: "17:30" },
                ]);
                setMutationError("");
                setPatternOpen(true);
              }}
              className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-navy-900"
            >
              Atur Pola Kelas
            </button>
            <button
              onClick={() => openMeeting()}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white"
            >
              <IconPlus className="h-4 w-4" />
              Tambah Pertemuan
            </button>
          </div>
        }
      />
      <SectionCard
        title="Jadwal Mingguan"
        description={`${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long" }).format(week)} – ${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(weekEnd)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <div className="rounded-md border p-0.5">
              <button
                onClick={() => setView("WEEK")}
                className={`rounded px-3 py-1.5 text-xs ${view === "WEEK" ? "bg-navy-900 text-white" : ""}`}
              >
                Minggu
              </button>
              <button
                onClick={() => setView("LIST")}
                className={`rounded px-3 py-1.5 text-xs ${view === "LIST" ? "bg-navy-900 text-white" : ""}`}
              >
                Daftar
              </button>
            </div>
            <button
              onClick={() => setWeek(monday(new Date()))}
              className="rounded-md border px-3 text-xs"
            >
              Hari Ini
            </button>
            <button
              onClick={() => setWeek(addDays(week, -7))}
              aria-label="Minggu sebelumnya"
              className="rounded-md border p-2"
            >
              <IconChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setWeek(addDays(week, 7))}
              aria-label="Minggu berikutnya"
              className="rounded-md border p-2"
            >
              <IconChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      >
        {loadError ? (
          <div className="py-8 text-center">
            <p className="text-sm text-red-600">{loadError}</p>
            <button
              onClick={load}
              className="mt-3 text-sm text-navy-900 underline"
            >
              Coba lagi
            </button>
          </div>
        ) : loading ? (
          <p className="py-10 text-center text-sm text-gray-400">
            Memuat kalender...
          </p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <select
                value={filter.program}
                onChange={(event) =>
                  setFilter({ ...filter, program: event.target.value })
                }
                className="rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Semua program</option>
                <option value="REGULAR">Reguler</option>
                <option value="PRIVATE">Privat</option>
              </select>
              <select
                value={filter.tutor}
                onChange={(event) =>
                  setFilter({ ...filter, tutor: event.target.value })
                }
                className="rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Semua tentor</option>
                {tutors.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                value={filter.status}
                onChange={(event) =>
                  setFilter({ ...filter, status: event.target.value })
                }
                className="rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Semua status</option>
                <option value="INCOMPLETE">Belum Lengkap</option>
                <option value="WAITING_NOTE">Menunggu catatan</option>
                <option value="NOTE_FILLED">Catatan diisi</option>
                <option value="COMPLETED">Selesai</option>
                <option value="CANCELLED">Dibatalkan</option>
              </select>
              <button
                onClick={() =>
                  setFilter({ program: "", tutor: "", status: "" })
                }
                className="px-2 text-sm text-navy-900"
              >
                Reset
              </button>
            </div>
            <p className="mb-3 text-sm text-gray-500">
              {items.length} pertemuan minggu ini ·{" "}
              {items.filter((item) => item.incomplete).length} belum dilengkapi
            </p>
            {view === "WEEK" ? (
              <WeekGrid
                week={week}
                items={items}
                chooseDay={setDayDate}
                choose={(item) =>
                  item.incomplete ? openMeeting(item) : setSelected(item)
                }
              />
            ) : (
              <MeetingList
                items={items}
                choose={(item) =>
                  item.incomplete ? openMeeting(item) : setSelected(item)
                }
                onEdit={openEdit}
                onDelete={setDeleteItem}
              />
            )}
            {!items.length && (
              <EmptyState
                title="Belum ada jadwal pada minggu ini"
                message="Atur pola kelas atau tambahkan pertemuan untuk memulai."
              />
            )}
          </>
        )}
      </SectionCard>
      {patternOpen && (
        <Modal
          title="Atur Pola Kelas"
          onClose={() => !saving && setPatternOpen(false)}
        >
          <form onSubmit={savePattern} className="space-y-4">
            <label className="block text-sm font-medium">
              Kelas *
              <select
                value={patternClassId}
                onChange={(event) => {
                  const value = event.target.value;
                  setPatternClassId(value);
                  setSlots(
                    patterns.filter((item) => item.classId === value).length
                      ? patterns
                          .filter((item) => item.classId === value)
                          .map((item) => ({
                            dayOfWeek: String(item.dayOfWeek),
                            startTime: time(item.startTime),
                            endTime: time(item.endTime),
                          }))
                      : [
                          {
                            dayOfWeek: "2",
                            startTime: "16:00",
                            endTime: "17:30",
                          },
                        ],
                  );
                }}
                className="mt-1 w-full rounded-md border px-3 py-2"
              >
                <option value="">Pilih kelas</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <p className="mb-2 text-sm font-semibold">Jadwal Mingguan</p>
              {slots.map((slot, index) => (
                <div
                  key={index}
                  className="mb-2 grid grid-cols-[1fr_1fr_1fr_auto] gap-2"
                >
                  <select
                    value={slot.dayOfWeek}
                    onChange={(event) =>
                      setSlots(
                        slots.map((row, i) =>
                          i === index
                            ? { ...row, dayOfWeek: event.target.value }
                            : row,
                        ),
                      )
                    }
                    className="rounded border px-2 py-2"
                  >
                    {DAYS.map((day, i) => (
                      <option key={day} value={i}>
                        {day}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={slot.startTime}
                    onChange={(event) =>
                      setSlots(
                        slots.map((row, i) =>
                          i === index
                            ? { ...row, startTime: event.target.value }
                            : row,
                        ),
                      )
                    }
                    className="rounded border px-2"
                  />
                  <input
                    type="time"
                    value={slot.endTime}
                    onChange={(event) =>
                      setSlots(
                        slots.map((row, i) =>
                          i === index
                            ? { ...row, endTime: event.target.value }
                            : row,
                        ),
                      )
                    }
                    className="rounded border px-2"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSlots(slots.filter((_, i) => i !== index))
                    }
                    disabled={slots.length === 1}
                    className="rounded border px-2 text-red-600"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setSlots([
                    ...slots,
                    { dayOfWeek: "2", startTime: "16:00", endTime: "17:30" },
                  ])
                }
                className="text-sm text-navy-900"
              >
                + Tambah Hari
              </button>
            </div>
            {mutationError && (
              <p className="text-sm text-red-600">{mutationError}</p>
            )}
            <Actions
              close={() => setPatternOpen(false)}
              saving={saving}
              label="Simpan Pola Jadwal"
            />
          </form>
        </Modal>
      )}
      {meetingOpen && (
        <Modal
          title={editing ? "Edit Pertemuan" : "Tambah Pertemuan"}
          onClose={() => {
            if (!saving) {
              setMeetingOpen(false);
              setEditing(null);
            }
          }}
          className="max-w-[680px]"
        >
          <form onSubmit={saveMeeting} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Program *">
                <select
                  value={form.sessionType}
                  disabled={Boolean(editing)}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      sessionType: event.target.value,
                      classId: "",
                      studentId: "",
                    })
                  }
                >
                  <option value="REGULAR">Reguler</option>
                  <option value="PRIVATE">Privat</option>
                </select>
              </Field>
              {form.sessionType === "REGULAR" ? (
                <Field label="Kelas *">
                  <select
                    value={form.classId}
                    disabled={Boolean(editing)}
                    onChange={(event) =>
                      setForm({ ...form, classId: event.target.value })
                    }
                  >
                    <option value="">Pilih kelas</option>
                    {classes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Siswa *">
                  <SearchableSelect
                    value={form.studentId}
                    query={studentQuery}
                    onQueryChange={setStudentQuery}
                    options={students}
                    disabled={Boolean(editing)}
                    placeholder="Cari siswa..."
                    emptyMessage={
                      students.length
                        ? "Siswa tidak ditemukan."
                        : "Belum ada siswa yang tersedia."
                    }
                    onSelect={(studentId) => setForm({ ...form, studentId })}
                  />
                </Field>
              )}
              <Field label="Tanggal *">
                <input
                  type="date"
                  value={form.sessionDate}
                  onChange={(event) =>
                    setForm({ ...form, sessionDate: event.target.value })
                  }
                />
              </Field>
              <Field label="Jam Mulai *">
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(event) =>
                    setForm({ ...form, startTime: event.target.value })
                  }
                />
              </Field>
              <Field label="Jam Selesai *">
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(event) =>
                    setForm({ ...form, endTime: event.target.value })
                  }
                />
              </Field>
              <Field label="Mata Pelajaran *">
                <select
                  value={form.subjectId}
                  onChange={(event) => {
                    setTutorQuery("");
                    setForm({
                      ...form,
                      subjectId: event.target.value,
                      tutorId: "",
                    });
                  }}
                >
                  <option value="">Pilih mapel</option>
                  {subjects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tentor *">
                <SearchableSelect
                  value={form.tutorId}
                  query={tutorQuery}
                  onQueryChange={setTutorQuery}
                  options={eligibleTutors}
                  disabled={!form.subjectId}
                  placeholder={
                    form.subjectId
                      ? "Cari tentor..."
                      : "Pilih mata pelajaran terlebih dahulu"
                  }
                  emptyMessage="Belum ada tentor yang dapat mengajar mata pelajaran ini."
                  onSelect={(tutorId) => setForm({ ...form, tutorId })}
                />
              </Field>
              <Field label="Mode">
                <select
                  value={form.mode}
                  onChange={(event) =>
                    setForm({ ...form, mode: event.target.value })
                  }
                >
                  <option value="OFFLINE">Offline</option>
                  <option value="ONLINE">Online</option>
                </select>
              </Field>
              {form.mode === "OFFLINE" && (
                <Field label="Lokasi">
                  <input
                    value={form.location}
                    onChange={(event) =>
                      setForm({ ...form, location: event.target.value })
                    }
                  />
                </Field>
              )}
            </div>
            {mutationError && (
              <p className="text-sm text-red-600">{mutationError}</p>
            )}
            <Actions
              close={() => {
                setMeetingOpen(false);
                setEditing(null);
              }}
              saving={saving}
              label={editing ? "Simpan Perubahan" : "Simpan Pertemuan"}
            />
          </form>
        </Modal>
      )}
      {selected && (
        <Modal title="Detail Pertemuan" onClose={() => setSelected(null)}>
          <div className="space-y-3 text-sm">
            <p>
              <b>Program:</b>{" "}
              {selected.sessionType === "REGULAR" ? "Reguler" : "Privat"}
            </p>
            <p>
              <b>Kelas / Siswa:</b> {selected.label}
            </p>
            <p>
              <b>Waktu:</b>{" "}
              {new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(
                selected.date,
              )}
              , {selected.start}–{selected.end}
            </p>
            <p>
              <b>Mata Pelajaran:</b> {selected.subject || "-"}
            </p>
            <p>
              <b>Tentor:</b> {selected.tutor || "-"}
            </p>
            <p>
              <b>Mode:</b>{" "}
              {selected.mode === "ONLINE"
                ? "Online"
                : selected.location
                  ? `Offline · ${selected.location}`
                  : "Offline"}
            </p>
            <p>
              <b>Status:</b> {calendarStateLabel(selected)}
            </p>
            {selected.meeting?.changeRequests?.[0] && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <b>Pengajuan perubahan:</b> Menunggu Admin<br />
                Usulan {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(selected.meeting.changeRequests[0].proposedDate))}, {time(selected.meeting.changeRequests[0].proposedStartTime)}–{time(selected.meeting.changeRequests[0].proposedEndTime)}
              </div>
            )}
            {selected.meeting && selected.calendarState !== "WAITING_NOTE" && (
              <p>
                <b>Catatan:</b>{" "}
                {selected.meeting.sessionType === "PRIVATE"
                  ? selected.meeting.progressNotes
                  : selected.meeting.teachingNotes}
              </p>
            )}
            {selected.meeting &&
              !["COMPLETED", "CANCELLED"].includes(selected.calendarState) && (
                <div className="border-t pt-3">
                  <button
                    onClick={() => openEdit(selected)}
                    className="mr-4 text-sm text-navy-900"
                  >
                    Edit Pertemuan
                  </button>
                  <button
                    onClick={() => {
                      setMutationError("");
                      setCancelReason("");
                      setCancelItem(selected);
                    }}
                    className="mr-4 text-sm text-red-600"
                  >
                    Batalkan Pertemuan
                  </button>
                  {selected.meeting && selected.status === "SCHEDULED" && (
                    <button
                      onClick={() => setDeleteItem(selected)}
                      className="text-sm text-red-600"
                    >
                      Hapus Pertemuan
                    </button>
                  )}
                </div>
              )}
          </div>
        </Modal>
      )}
      {cancelItem && (
        <Modal
          title="Batalkan Pertemuan"
          onClose={() => !cancelling && setCancelItem(null)}
        >
          <div className="space-y-4 text-sm text-gray-600">
            <p>
              Pertemuan <strong>{cancelItem.label}</strong> pada{" "}
              {new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(
                cancelItem.date,
              )}
              , {cancelItem.start}–{cancelItem.end} akan dibatalkan.
            </p>
            <p>
              Pertemuan yang dibatalkan tetap disimpan sebagai histori dan tidak
              dihitung sebagai sesi selesai.
            </p>
            <textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Alasan pembatalan (minimal 3 karakter)"
              rows={3}
              className="w-full rounded-md border p-2"
            />
            {mutationError && <p className="text-red-600">{mutationError}</p>}
            <div className="flex justify-end gap-2">
              <button
                disabled={cancelling}
                onClick={() => setCancelItem(null)}
                className="rounded border px-4 py-2"
              >
                Kembali
              </button>
              <button
                disabled={cancelling}
                onClick={cancelMeeting}
                className="rounded bg-red-600 px-4 py-2 text-white"
              >
                {cancelling ? "Membatalkan..." : "Batalkan Pertemuan"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {deleteItem && (
        <Modal
          title="Hapus Pertemuan?"
          onClose={() => !deleting && setDeleteItem(null)}
        >
          <div className="space-y-4 text-sm text-gray-600">
            <p>
              Pertemuan <strong>{deleteItem.label}</strong> pada{" "}
              {new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(
                deleteItem.date,
              )}
              , {deleteItem.start}–{deleteItem.end} akan dihapus permanen.
              Tindakan ini tidak dapat dibatalkan.
            </p>
            {mutationError && <p className="text-red-600">{mutationError}</p>}
            <div className="flex justify-end gap-2">
              <button
                disabled={deleting}
                onClick={() => setDeleteItem(null)}
                className="rounded border px-4 py-2"
              >
                Batal
              </button>
              <button
                disabled={deleting}
                onClick={deleteMeeting}
                className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-60"
              >
                {deleting ? "Menghapus..." : "Hapus Pertemuan"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {dayDate && (
        <DayDrawer
          date={dayDate}
          items={items.filter((item) => iso(item.date) === iso(dayDate))}
          onClose={() => setDayDate(null)}
          onDetail={setSelected}
          onEdit={openEdit}
          onComplete={openMeeting}
          onDelete={setDeleteItem}
        />
      )}
    </div>
  );
}

function DayDrawer({
  date,
  items,
  onClose,
  onDetail,
  onEdit,
  onComplete,
  onDelete,
}: {
  date: Date;
  items: CalendarItem[];
  onClose: () => void;
  onDetail: (item: CalendarItem) => void;
  onEdit: (item: CalendarItem) => void;
  onComplete: (item: CalendarItem) => void;
  onDelete: (item: CalendarItem) => void;
}) {
  const ordered = [...items].sort((a, b) => a.start.localeCompare(b.start));
  return (
    <div className="fixed inset-0 z-40 bg-black/30">
      <aside className="ml-auto h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
        <button
          onClick={onClose}
          className="float-right text-lg"
          aria-label="Tutup detail hari"
        >
          ×
        </button>
        <h2 className="text-lg font-semibold">Jadwal {DAYS[date.getDay()]}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(date)}
        </p>
        <p className="mt-3 text-sm text-gray-500">
          {ordered.length} pertemuan
          {ordered.filter((item) => item.incomplete).length
            ? ` · ${ordered.filter((item) => item.incomplete).length} belum dilengkapi`
            : ""}
        </p>
        <div className="mt-5 space-y-3">
          {ordered.length ? (
            ordered.map((item) => (
              <article key={item.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {item.start}–{item.end}
                    </p>
                    <p className="mt-1 text-xs font-semibold">
                      {item.incomplete
                        ? "BELUM DILENGKAPI"
                        : item.sessionType === "REGULAR"
                          ? "REGULER"
                          : "PRIVAT"}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {calendarStateLabel(item)}
                  </span>
                </div>
                <p className="mt-2 font-medium">{item.label}</p>
                <p className="text-sm text-gray-600">
                  {item.incomplete
                    ? "Mapel & Tentor belum ditentukan"
                    : item.subject}
                </p>
                {item.tutor && (
                  <p className="text-sm text-gray-600">{item.tutor}</p>
                )}
                <div className="mt-3 flex gap-3">
                  <button
                    onClick={() =>
                      item.incomplete ? onComplete(item) : onDetail(item)
                    }
                    className="text-sm text-navy-900 underline"
                  >
                    {item.incomplete ? "Lengkapi" : "Detail"}
                  </button>
                  {!item.incomplete &&
                    !["COMPLETED", "CANCELLED"].includes(
                      item.calendarState,
                    ) && (
                      <button
                        onClick={() => onEdit(item)}
                        className="text-sm text-navy-900 underline"
                      >
                        Edit
                      </button>
                    )}
                  {item.meeting && item.status === "SCHEDULED" && (
                    <button
                      onClick={() => onDelete(item)}
                      className="text-sm text-red-600 underline"
                    >
                      Hapus
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
              Belum ada pertemuan.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function WeekGrid({
  week,
  items,
  choose,
  chooseDay,
}: {
  week: Date;
  items: CalendarItem[];
  choose: (item: CalendarItem) => void;
  chooseDay: (date: Date) => void;
}) {
  const startHour = 8;
  const toMinutes = (value: string) =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const endHour = Math.max(
    20,
    ...items.map((item) => Math.ceil(toMinutes(item.end) / 60) + 1),
  );
  const height = (endHour - startHour) * 60;
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[1080px] grid-cols-[56px_repeat(7,minmax(132px,1fr))] border-l border-t border-gray-200">
        <div className="sticky top-0 z-20 bg-white" />
        {Array.from({ length: 7 }, (_, index) => {
          const date = addDays(week, index);
          return (
            <button
              key={iso(date)}
              onClick={() => chooseDay(date)}
              className={`sticky top-0 z-10 border-b border-r border-gray-200 px-2 py-2 text-center text-xs font-semibold ${iso(date) === iso(new Date()) ? "bg-navy-50 text-navy-900" : "bg-white text-gray-600"}`}
            >
              {DAYS[date.getDay()]} {date.getDate()}
            </button>
          );
        })}
        <div className="relative border-r border-gray-200" style={{ height }}>
          {Array.from({ length: endHour - startHour + 1 }, (_, index) => (
            <span
              key={index}
              className="absolute -top-2 right-2 text-[11px] text-gray-400"
              style={{ top: index * 60 }}
            >
              {pad(startHour + index)}:00
            </span>
          ))}
        </div>
        {Array.from({ length: 7 }, (_, index) => {
          const date = addDays(week, index);
          const dayItems = items.filter((item) => iso(item.date) === iso(date));
          return (
            <div
              key={iso(date)}
              className="relative border-r border-gray-200 bg-white"
              style={{
                height,
                backgroundImage:
                  "linear-gradient(to bottom, transparent 59px, #edf0f3 60px)",
              }}
            >
              {dayItems.map((item) => {
                const overlaps = dayItems.filter(
                  (other) =>
                    toMinutes(other.start) < toMinutes(item.end) &&
                    toMinutes(other.end) > toMinutes(item.start),
                );
                const lane = overlaps.findIndex(
                  (other) => other.id === item.id,
                );
                const laneWidth = 100 / overlaps.length;
                return (
                  <button
                    key={item.id}
                    onClick={() => choose(item)}
                    className={`absolute overflow-hidden rounded-md border p-2 text-left text-xs shadow-sm ${item.calendarState === "INCOMPLETE" ? "border-orange-200 bg-orange-50 text-orange-800" : item.calendarState === "CANCELLED" ? "border-red-200 bg-red-50 text-red-700" : item.calendarState === "WAITING_NOTE" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}
                    style={{
                      top:
                        Math.max(0, toMinutes(item.start) - startHour * 60) + 2,
                      height: Math.max(
                        48,
                        toMinutes(item.end) - toMinutes(item.start) - 4,
                      ),
                      left: `calc(${lane * laneWidth}% + 3px)`,
                      width: `calc(${laneWidth}% - 6px)`,
                    }}
                  >
                    <p className="font-semibold">
                      {item.calendarState === "INCOMPLETE"
                        ? "Belum dilengkapi"
                        : item.sessionType === "PRIVATE"
                          ? "PRIVAT"
                          : "REGULER"}
                    </p>
                    <p className="mt-1">
                      {item.start}–{item.end}
                    </p>
                    <p className="mt-1 font-semibold">{item.label}</p>
                    <p>
                      {item.incomplete
                        ? "Mapel & Tentor belum ditentukan"
                        : item.subject}
                    </p>
                    {item.tutor && <p>{item.tutor}</p>}
                    {!item.incomplete && (
                      <p className="mt-1 font-medium">
                        {calendarStateLabel(item)}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function MeetingList({
  items,
  choose,
  onEdit,
  onDelete,
}: {
  items: CalendarItem[];
  choose: (item: CalendarItem) => void;
  onEdit: (item: CalendarItem) => void;
  onDelete: (item: CalendarItem) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-left text-xs text-gray-500">
            <th className="p-3">Tanggal</th>
            <th>Waktu</th>
            <th>Program</th>
            <th>Kelas / Siswa</th>
            <th>Mapel</th>
            <th>Tentor</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="p-3">
                {new Intl.DateTimeFormat("id-ID", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                }).format(item.date)}
              </td>
              <td>
                {item.start}–{item.end}
              </td>
              <td>{item.sessionType === "REGULAR" ? "Reguler" : "Privat"}</td>
              <td>{item.label}</td>
              <td>{item.subject || "-"}</td>
              <td>{item.tutor || "-"}</td>
              <td>{calendarStateLabel(item)}</td>
              <td>
                <div className="flex gap-3 text-xs font-medium">
                  <button
                    onClick={() => choose(item)}
                    className="text-navy-900 hover:underline"
                  >
                    {item.incomplete ? "Lengkapi" : "Detail"}
                  </button>
                  {!item.incomplete &&
                    !["COMPLETED", "CANCELLED"].includes(
                      item.calendarState,
                    ) && (
                      <button
                        onClick={() => onEdit(item)}
                        className="text-gray-700 hover:underline"
                      >
                        Edit
                      </button>
                    )}
                  {item.meeting && item.status === "SCHEDULED" && (
                    <button
                      onClick={() => onDelete(item)}
                      className="text-red-600 hover:underline"
                    >
                      Hapus
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-sm font-medium text-gray-700">
      {label}
      <span className="mt-1 block [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:px-3 [&_input]:py-2 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:px-3 [&_select]:py-2">
        {children}
      </span>
    </label>
  );
}
function SearchableSelect({
  value,
  query,
  onQueryChange,
  options,
  placeholder,
  emptyMessage,
  disabled = false,
  onSelect,
}: {
  value: string;
  query: string;
  onQueryChange: (value: string) => void;
  options: Option[];
  placeholder: string;
  emptyMessage: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);
  const visible = options.filter((option) =>
    option.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="relative">
      <input
        value={open ? query : selected?.name || query}
        disabled={disabled}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls="searchable-options"
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && visible.length === 1) {
            event.preventDefault();
            onSelect(visible[0].id);
            onQueryChange("");
            setOpen(false);
          }
        }}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
        }}
        className="w-full rounded-md border px-3 py-2 disabled:bg-slate-50 disabled:text-gray-500"
      />
      {open && !disabled && (
        <div
          id="searchable-options"
          role="listbox"
          className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-md border bg-white py-1 shadow-lg"
        >
          {visible.length ? (
            visible.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(option.id);
                  onQueryChange("");
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                {option.name}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-gray-500">{emptyMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
function Actions({
  close,
  saving,
  label,
}: {
  close: () => void;
  saving: boolean;
  label: string;
}) {
  return (
    <div className="flex justify-end gap-2 border-t pt-4">
      <button
        type="button"
        onClick={close}
        disabled={saving}
        className="rounded-md border px-4 py-2 text-sm"
      >
        Batal
      </button>
      <button
        disabled={saving}
        className="rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white"
      >
        {saving ? "Menyimpan..." : label}
      </button>
    </div>
  );
}
