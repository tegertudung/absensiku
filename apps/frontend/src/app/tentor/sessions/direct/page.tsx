"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import {
  IconBook,
  IconCheckCircle,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconMapPin,
  IconPrivate,
  IconSchedule,
  IconSearch,
  IconStudent,
  IconVideo,
  IconWarning,
  IconX,
} from "@/components/icons";
type Option = { id: string; name: string };
type Program = Option & {
  learningModel: "CLASS_BASED" | "INDIVIDUAL";
  isActive: boolean;
};
type StudentOption = Option & {
  studentCode: string;
  programEnrollments?: Array<{
    programId: string;
    status: string;
    program: { learningModel: string; isActive: boolean };
  }>;
};
type Form = {
  scheduleId: string;
  sessionDate: string;
  sessionType: "REGULAR" | "PRIVATE";
  programId: string;
  classId: string;
  studentIds: string[];
  subjectId: string;
  startTime: string;
  endTime: string;
  mode: "OFFLINE" | "ONLINE";
  location: string;
  material: string;
  progressNotes: string;
  score: string;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const label = (v: string) =>
  new Date(`${v}T00:00:00`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const dur = (a: string, b: string) => {
  const m =
    Number(b.slice(0, 2)) * 60 +
    Number(b.slice(3)) -
    Number(a.slice(0, 2)) * 60 -
    Number(a.slice(3));
  return m > 0
    ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)} jam` : ""}${m >= 60 && m % 60 ? " " : ""}${m % 60 ? `${m % 60} menit` : ""}`
    : null;
};
const initial = (): Form => ({
  scheduleId: "",
  sessionDate: today(),
  sessionType: "REGULAR",
  programId: "",
  classId: "",
  studentIds: [],
  subjectId: "",
  startTime: "13:00",
  endTime: "14:30",
  mode: "OFFLINE",
  location: "",
  material: "",
  progressNotes: "",
  score: "",
});
export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [classes, setClasses] = useState<Option[]>([]),
    [programs, setPrograms] = useState<Program[]>([]),
    [students, setStudents] = useState<StudentOption[]>([]),
    [subjects, setSubjects] = useState<Option[]>([]),
    [form, setForm] = useState<Form>(initial),
    [loading, setLoading] = useState(true),
    [submitting, setSubmitting] = useState(false),
    [error, setError] = useState<string | null>(null),
    [saved, setSaved] = useState(false);
  const set = (x: Partial<Form>) => setForm((p) => ({ ...p, ...x }));
  useEffect(() => {
    const scheduleId = searchParams.get("scheduleId");
    const sessionDate = searchParams.get("sessionDate");
    if (scheduleId) set({ scheduleId, ...(sessionDate ? { sessionDate } : {}) });
  }, [searchParams]);
  const selectedProgram = programs.find(
    (program) => program.id === form.programId,
  );
  const privateSession = selectedProgram?.learningModel === "INDIVIDUAL",
    duration = dur(form.startTime, form.endTime);
  const eligibleStudents = students.filter((student) =>
    student.programEnrollments?.some(
      (enrollment) =>
        enrollment.status === "ACTIVE" &&
        enrollment.programId === form.programId,
    ),
  );
  const selected = useMemo(
    () => ({
      kelas: classes.find((x) => x.id === form.classId),
      students: students.filter((x) => form.studentIds.includes(x.id)),
      subject: subjects.find((x) => x.id === form.subjectId),
    }),
    [
      classes,
      students,
      subjects,
      form.classId,
      form.studentIds,
      form.subjectId,
    ],
  );
  const valid = !!(
    selectedProgram &&
    form.subjectId &&
    (privateSession ? form.studentIds.length > 0 : form.classId) &&
    form.material.trim() &&
    (!privateSession || form.progressNotes.trim()) &&
    duration
  );
  useEffect(() => {
    Promise.all([
      api.get("/classes"),
      api.get("/students"),
      api.get("/subjects"),
      api.get("/programs?active=true"),
    ])
      .then(([c, s, m, p]) => {
        setClasses(c.data.data.filter((x: any) => x.status === "ACTIVE"));
        setStudents(
          s.data.data.filter(
            (x: StudentOption & { status: string }) => x.status === "ACTIVE",
          ),
        );
        setSubjects(m.data.data.filter((x: any) => x.isActive));
        setPrograms(p.data.data);
      })
      .catch(() => setError("Pilihan form gagal dimuat."))
      .finally(() => setLoading(false));
  }, []);
  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/sessions/direct", {
        ...form,
        scheduleId: form.scheduleId || undefined,
        sessionType: privateSession ? "PRIVATE" : "REGULAR",
        classId: privateSession ? undefined : form.classId,
        studentIds: privateSession ? form.studentIds : undefined,
        location:
          form.mode === "OFFLINE" && form.location.trim()
            ? form.location.trim()
            : undefined,
        score: form.score === "" ? undefined : Number(form.score),
      });
      setSaved(true);
    } catch (e: any) {
      setError(
        e.response?.data?.message ||
          e.response?.data?.error ||
          "Sesi gagal dicatat. Data form tetap tersimpan.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  if (saved)
    return (
      <Success
        form={form}
        selected={selected}
        duration={duration!}
        recap={() => router.push("/tentor/recap")}
        home={() => router.push("/tentor")}
      />
    );
  return (
    <div className="mx-auto w-full max-w-md pb-36 pt-1">
      <button
        onClick={() => router.back()}
        className="flex min-h-11 items-center gap-1 text-sm font-medium text-navy-800"
      >
        <IconChevronLeft className="h-5 w-5" />
        Kembali
      </button>
      <header className="mb-6 mt-2">
        <h1 className="text-[22px] font-bold tracking-tight text-navy-900">
          Catat Sesi Mengajar
        </h1>
        <p className="mt-1.5 max-w-xs text-sm leading-5 text-gray-500">
          Catat sesi tanpa jadwal atau sesi yang belum sempat dicatat.
        </p>
      </header>
      <section className="rounded-[18px] bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 px-5 py-6 text-center text-white shadow-lg">
        <p className="text-xs font-medium tracking-wide text-navy-200">
          RINGKASAN WAKTU SESI
        </p>
        <p className="mt-2 text-[34px] font-bold">
          {form.startTime || "--:--"}
        </p>
        <p className="mt-1 text-sm text-white/85">{label(form.sessionDate)}</p>
        <p className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs">
          <IconClock className="h-3.5 w-3.5" />
          {duration
            ? `${form.startTime} – ${form.endTime} · ${duration}`
            : "Jam selesai belum dipilih"}
        </p>
      </section>
      {error && (
        <div className="mt-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
          <IconWarning className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      <div className="mt-6 space-y-6">
        <Field label="Tanggal *">
          <label className="relative block">
            <IconSchedule className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-navy-700" />
            <input
              type="date"
              value={form.sessionDate}
              max={today()}
              onChange={(e) => set({ sessionDate: e.target.value })}
              className="control pl-11"
            />
          </label>
          <p className="mt-2 text-xs text-gray-500">
            {label(form.sessionDate)}
          </p>
        </Field>
        <Field label="Program *">
          <Choice
            icon={<IconBook className="h-5 w-5" />}
            value={form.programId}
            items={programs}
            placeholder={loading ? "Memuat Program..." : "Pilih Program"}
            change={(programId) =>
              set({ programId, classId: "", studentIds: [] })
            }
          />
        </Field>
        <Field label={privateSession ? "Siswa *" : "Kelas *"}>
          {privateSession ? (
            <PrivateStudentMultiSelect
              students={eligibleStudents}
              selectedIds={form.studentIds}
              disabled={loading}
              change={(studentIds) => set({ studentIds })}
            />
          ) : (
            <Choice
              icon={<IconSchedule className="h-5 w-5" />}
              value={form.classId}
              items={classes}
              placeholder={loading ? "Memuat pilihan..." : "Pilih kelas"}
              change={(classId) => set({ classId })}
            />
          )}
        </Field>
        <Field label="Mata Pelajaran *">
          <Choice
            icon={<IconBook className="h-5 w-5" />}
            value={form.subjectId}
            items={subjects}
            placeholder={loading ? "Memuat pilihan..." : "Pilih mata pelajaran"}
            change={(v) => set({ subjectId: v })}
          />
        </Field>
        <Field label="Waktu">
          <div className="grid grid-cols-2 gap-3">
            <Time
              label="Jam Mulai"
              value={form.startTime}
              change={(v) => set({ startTime: v })}
            />
            <Time
              label="Jam Selesai"
              value={form.endTime}
              change={(v) => set({ endTime: v })}
            />
          </div>
          <p
            className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium ${duration ? "bg-navy-50 text-navy-800" : "bg-red-50 text-red-600"}`}
          >
            <IconClock className="h-4 w-4" />
            {duration
              ? `Durasi sesi ${duration}`
              : "Jam selesai harus setelah jam mulai."}
          </p>
        </Field>
        <Field label="Mode Belajar">
          <div className="grid grid-cols-2 gap-2">
            <Segment
              active={form.mode === "OFFLINE"}
              click={() => set({ mode: "OFFLINE" })}
              icon={<IconMapPin className="h-4 w-4" />}
            >
              Offline
            </Segment>
            <Segment
              active={form.mode === "ONLINE"}
              click={() => set({ mode: "ONLINE" })}
              icon={<IconVideo className="h-4 w-4" />}
            >
              Online
            </Segment>
          </div>
          {form.mode === "OFFLINE" && (
            <label className="relative mt-3 block">
              <IconMapPin className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-navy-700" />
              <input
                value={form.location}
                onChange={(e) => set({ location: e.target.value })}
                placeholder="Masukkan lokasi (opsional)..."
                className="control pl-11"
              />
            </label>
          )}
        </Field>
        <Field label="Materi Hari Ini *">
          <textarea
            value={form.material}
            onChange={(e) => set({ material: e.target.value })}
            rows={4}
            placeholder="Materi yang dipelajari..."
            className="control min-h-[104px] resize-none"
          />
        </Field>
        {privateSession && (
          <Field label="Catatan Perkembangan *">
            <textarea
              value={form.progressNotes}
              onChange={(e) => set({ progressNotes: e.target.value })}
              rows={4}
              placeholder="Tuliskan perkembangan siswa pada sesi ini..."
              className="control min-h-[104px] resize-none"
            />
          </Field>
        )}
        <Field label="Nilai (opsional)">
          <input
            type="number"
            min="0"
            max="100"
            value={form.score}
            onChange={(e) => set({ score: e.target.value })}
            placeholder="Masukkan nilai (0–100)"
            className="control"
          />
        </Field>
      </div>
      <div className="fixed inset-x-0 bottom-[57px] z-20 border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <button
            onClick={submit}
            disabled={!valid || submitting}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-navy-900 text-sm font-semibold text-white shadow-sm transition active:scale-[.985] disabled:bg-gray-300"
          >
            <IconCheckCircle className="h-5 w-5" />
            {submitting ? "Mencatat sesi..." : "Catat Sesi Mengajar"}
          </button>
        </div>
      </div>
    </div>
  );
}
function Field(p: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-navy-900">{p.label}</h2>
      {p.children}
    </section>
  );
}
function Segment(p: {
  active: boolean;
  click: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={p.click}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition active:scale-[.98] ${p.active ? "border-navy-900 bg-navy-900 text-white" : "border-gray-200 bg-white text-navy-800"}`}
    >
      {p.icon}
      {p.children}
    </button>
  );
}
function Choice(p: {
  icon: React.ReactNode;
  value: string;
  items: Option[];
  placeholder: string;
  change: (v: string) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-3.5 text-navy-700">
        {p.icon}
      </span>
      <select
        value={p.value}
        onChange={(e) => p.change(e.target.value)}
        className="control appearance-none pl-11 pr-10"
      >
        <option value="">{p.placeholder}</option>
        {p.items.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      <IconChevronRight className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-gray-400" />
    </div>
  );
}
function PrivateStudentMultiSelect(p: {
  students: StudentOption[];
  selectedIds: string[];
  disabled: boolean;
  change: (studentIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const selectedStudents = p.students.filter((student) =>
    p.selectedIds.includes(student.id),
  );
  const results = p.students.filter((student) => {
    const normalizedQuery = query.toLocaleLowerCase("id-ID");
    return (
      student.name.toLocaleLowerCase("id-ID").includes(normalizedQuery) ||
      student.studentCode.toLocaleLowerCase("id-ID").includes(normalizedQuery)
    );
  });
  const summary = selectedStudents.map((student) => student.name).join(", ");
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  const close = () => {
    setOpen(false);
    setQuery("");
    setSelectionError("");
  };
  const toggle = (studentId: string) => {
    if (p.selectedIds.includes(studentId)) {
      p.change(p.selectedIds.filter((id) => id !== studentId));
      setSelectionError("");
      return;
    }
    if (p.selectedIds.length >= 3) {
      setSelectionError("Maksimal 3 siswa dalam satu sesi privat.");
      return;
    }
    p.change([...p.selectedIds, studentId]);
    setSelectionError("");
  };
  return (
    <>
      <button
        type="button"
        disabled={p.disabled}
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 text-left transition hover:border-navy-300 disabled:cursor-not-allowed disabled:bg-gray-50"
      >
        <IconStudent className="h-5 w-5 shrink-0 text-navy-700" />
        <span
          className={`min-w-0 flex-1 truncate text-sm ${summary ? "font-medium text-navy-900" : "text-gray-500"}`}
        >
          {summary || (p.disabled ? "Memuat siswa..." : "Pilih siswa privat")}
        </span>
        <IconChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-slate-950/35"
          role="dialog"
          aria-modal="true"
          aria-label="Pilih Siswa"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section className="max-h-[84vh] w-full rounded-t-3xl bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-200" />
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-navy-900">
                Pilih Siswa
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Tutup"
                className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
              >
                <IconX className="h-5 w-5" />
              </button>
            </header>
            <label className="relative mb-3 block">
              <span className="sr-only">Cari nama siswa</span>
              <IconSearch className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama atau kode SIS..."
                className="min-h-11 w-full rounded-xl border border-gray-200 py-2 pl-10 pr-3 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-100"
              />
            </label>
            {selectionError && (
              <p
                role="alert"
                className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"
              >
                {selectionError}
              </p>
            )}
            <div className="max-h-[55vh] overflow-y-auto pb-2">
              {p.students.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-gray-500">
                  Tidak ada siswa privat yang tersedia.
                </p>
              ) : results.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-gray-500">
                  Siswa tidak ditemukan.
                </p>
              ) : (
                results.map((student) => {
                  const selected = p.selectedIds.includes(student.id);
                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => toggle(student.id)}
                      className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left transition ${selected ? "bg-navy-50 text-navy-900" : "hover:bg-gray-50"}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-50 text-xs font-semibold text-navy-700">
                        {initials(student.name)}
                      </span>
                      <span className="flex-1 text-sm font-medium">
                        {student.name}
                        <span className="mt-0.5 block text-xs font-normal text-gray-500">
                          {student.studentCode}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${selected ? "border-navy-700 bg-navy-700 text-white" : "border-gray-300 text-transparent"}`}
                      >
                        ✓
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
function Time(p: {
  label: string;
  value: string;
  change: (v: string) => void;
}) {
  return (
    <label className="block min-h-[82px] rounded-xl border border-gray-200 bg-white px-3.5 py-3">
      <span className="text-xs font-medium text-gray-500">{p.label}</span>
      <span className="mt-2 flex items-center gap-2">
        <IconClock className="h-4 w-4 text-navy-700" />
        <input
          type="time"
          value={p.value}
          onChange={(e) => p.change(e.target.value)}
          className="min-w-0 bg-transparent text-base font-semibold text-navy-900 outline-none"
        />
      </span>
    </label>
  );
}
function Success(p: any) {
  const rows = [
    ["Tanggal", label(p.form.sessionDate)],
    ["Mata Pelajaran", p.selected.subject?.name || "-"],
    [
      p.form.sessionType === "PRIVATE" ? "Siswa" : "Kelas",
      p.form.sessionType === "PRIVATE"
        ? p.selected.students
            .map((student: Option) => student.name)
            .join(", ") || "-"
        : p.selected.kelas?.name || "-",
    ],
    [
      "Mode",
      p.form.mode === "OFFLINE"
        ? `Offline${p.form.location ? ` · ${p.form.location}` : ""}`
        : "Online",
    ],
    ["Mulai", p.form.startTime],
    ["Selesai", p.form.endTime],
    ["Durasi", p.duration],
  ];
  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center py-6">
      <div className="text-center">
        <span className="mx-auto flex h-20 w-20 animate-[pulse_.6s_ease-out_1] items-center justify-center rounded-full bg-green-500 text-white shadow-[0_0_0_10px_rgba(16,185,129,.1),0_0_0_20px_rgba(16,185,129,.06)]">
          <IconCheckCircle className="h-11 w-11" />
        </span>
        <h1 className="mt-6 text-2xl font-bold text-navy-900">
          Sesi berhasil dicatat!
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Data sesi mengajar telah masuk ke rekap Anda.
        </p>
      </div>
      <div className="mt-8 divide-y rounded-2xl border border-gray-200 bg-white px-4 shadow-sm">
        {rows.map((r: any) => (
          <div key={r[0]} className="flex justify-between gap-4 py-3.5 text-sm">
            <span className="text-gray-500">{r[0]}</span>
            <b className="text-right text-navy-900">{r[1]}</b>
          </div>
        ))}
      </div>
      <div className="mt-7 space-y-3">
        <button
          onClick={p.recap}
          className="min-h-[52px] w-full rounded-xl bg-navy-900 text-sm font-semibold text-white"
        >
          Lihat Rekap Mengajar
        </button>
        <button
          onClick={p.home}
          className="min-h-12 w-full text-sm font-semibold text-navy-800"
        >
          Kembali ke Beranda
        </button>
      </div>
    </div>
  );
}
