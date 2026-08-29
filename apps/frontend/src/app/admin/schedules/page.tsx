"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import Modal from "@/components/Modal";
import PageHeader from "@/components/PageHeader";
import SectionCard from "@/components/SectionCard";
import { StatusBadge, TypeBadge } from "@/components/StatusBadge";
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconX,
} from "@/components/icons";
type Schedule = {
  id: string;
  sessionType: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate: string;
  status: string;
  mode: string;
  location: string | null;
  tutor: { name: string };
  class: { name: string; quotaRemaining?: number; quotaTotal?: number } | null;
  student: { name: string } | null;
  subject: { name: string } | null;
};
type Option = { id: string; name: string };
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu"];
const H = 50;
const d = (v: string) => new Date(v);
const tv = (v: string) => {
  const x = d(v);
  return x.getHours() * 60 + x.getMinutes();
};
const tm = (v: string) => {
  const x = d(v);
  return `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
};
const key = (x: Date) => x.toISOString().slice(0, 10);
const add = (x: Date, n: number) => {
  const y = new Date(x);
  y.setDate(y.getDate() + n);
  return y;
};
const monday = (x: Date) => add(x, -((x.getDay() + 6) % 7));
function range(x: Date) {
  const y = add(x, 6),
    f = new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  return x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear()
    ? `${x.getDate()} – ${f.format(y)}`
    : `${f.format(x)} – ${f.format(y)}`;
}
export default function AdminSchedulesPage() {
  const [rows, setRows] = useState<Schedule[]>([]),
    [tutors, setTutors] = useState<Option[]>([]),
    [classes, setClasses] = useState<Option[]>([]),
    [students, setStudents] = useState<Option[]>([]),
    [subjects, setSubjects] = useState<Option[]>([]),
    [loading, setLoading] = useState(true),
    [mode, setMode] = useState<"WEEK" | "LIST">("WEEK"),
    [week, setWeek] = useState(() => monday(new Date())),
    [chosen, setChosen] = useState<Schedule | null>(null),
    [tutorId, setTutorId] = useState(""),
    [program, setProgram] = useState(""),
    [subjectId, setSubjectId] = useState(""),
    [q, setQ] = useState(""),
    [filtersOpen, setFiltersOpen] = useState(false),
    [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [form, setForm] = useState({
    tutorId: "",
    sessionType: "REGULAR",
    classId: "",
    studentId: "",
    subjectId: "",
    dayOfWeek: "1",
    startTime: "09:00",
    endTime: "10:30",
    startDate: key(new Date()),
    mode: "OFFLINE",
    location: "",
  });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b, c, e, f] = await Promise.all([
        api.get("/schedules"),
        api.get("/tutors"),
        api.get("/classes"),
        api.get("/students"),
        api.get("/subjects"),
      ]);
      setRows(a.data.data);
      setTutors(b.data.data);
      setClasses(c.data.data);
      setStudents(e.data.data);
      setSubjects(f.data.data);
    } catch {
      setError("Gagal memuat jadwal.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const filtered = useMemo(
    () =>
      rows.filter(
        (s) =>
          (!tutorId ||
            s.tutor.name === tutors.find((x) => x.id === tutorId)?.name) &&
          (!program || s.sessionType === program) &&
          (!subjectId ||
            s.subject?.name ===
              subjects.find((x) => x.id === subjectId)?.name) &&
          (!q ||
            `${s.class?.name || ""} ${s.student?.name || ""}`
              .toLowerCase()
              .includes(q.toLowerCase())),
      ),
    [rows, tutorId, program, subjectId, q, tutors, subjects],
  );
  const forDay = (day: number) =>
    filtered.filter(
      (s) => s.dayOfWeek === day && d(s.startDate) <= add(week, (day + 6) % 7),
    );
  const weekRows = [1, 2, 3, 4, 5, 6, 0].flatMap(forDay);
  const activeFilters = [
    tutorId && {
      key: "tutor",
      label: tutors.find((x) => x.id === tutorId)?.name || "Tentor",
    },
    program && {
      key: "program",
      label: program === "PRIVATE" ? "Privat" : "Reguler",
    },
    subjectId && {
      key: "subject",
      label: subjects.find((x) => x.id === subjectId)?.name || "Mapel",
    },
    q && { key: "query", label: q },
  ].filter(Boolean) as { key: string; label: string }[];
  const timeRange = useMemo(() => {
    if (!weekRows.length) return { start: 8, end: 18 };
    const earliest = Math.min(...weekRows.map((item) => tv(item.startTime)));
    const latest = Math.max(...weekRows.map((item) => tv(item.endTime)));
    return {
      start: Math.max(7, Math.floor(earliest / 60) - 1),
      end: Math.min(21, Math.ceil(latest / 60) + 1),
    };
  }, [weekRows]);
  function clearFilters() {
    setTutorId("");
    setProgram("");
    setSubjectId("");
    setQ("");
  }
  function removeFilter(filter: string) {
    if (filter === "tutor") setTutorId("");
    if (filter === "program") setProgram("");
    if (filter === "subject") setSubjectId("");
    if (filter === "query") setQ("");
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (
      !form.tutorId ||
      !form.subjectId ||
      (form.sessionType === "REGULAR" && !form.classId) ||
      (form.sessionType === "PRIVATE" && !form.studentId)
    ) {
      setError("Lengkapi tentor, mapel, dan kelas atau siswa.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/schedules", {
        ...form,
        dayOfWeek: Number(form.dayOfWeek),
        classId: form.sessionType === "REGULAR" ? form.classId : undefined,
        studentId: form.sessionType === "PRIVATE" ? form.studentId : undefined,
        location: form.mode === "OFFLINE" && form.location.trim() ? form.location.trim() : undefined,
      });
      setOpen(false);
      await load();
    } catch (e: any) {
      setError(e.response?.data?.message || "Gagal menyimpan jadwal.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Jadwal"
        description="Kelola jadwal mengajar reguler dan privat."
        action={
          <button
            onClick={() => setOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white"
          >
            <IconPlus className="h-4 w-4" />
            Tambah Jadwal
          </button>
        }
      />
      <div
        className={
          chosen && mode === "WEEK"
            ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]"
            : "block"
        }
      >
        <SectionCard
          title="Jadwal Mingguan"
          description={
            mode === "WEEK"
              ? range(week)
              : "Daftar jadwal yang sesuai dengan filter."
          }
          action={
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-gray-200 p-0.5">
                <button
                  onClick={() => setMode("WEEK")}
                  className={`rounded px-3 py-1.5 text-xs ${mode === "WEEK" ? "bg-navy-900 text-white" : "text-gray-600"}`}
                >
                  Minggu
                </button>
                <button
                  onClick={() => setMode("LIST")}
                  className={`rounded px-3 py-1.5 text-xs ${mode === "LIST" ? "bg-navy-900 text-white" : "text-gray-600"}`}
                >
                  Daftar
                </button>
              </div>
              {mode === "WEEK" && (
                <>
                  <button
                    onClick={() => setWeek(monday(new Date()))}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-xs"
                  >
                    Hari Ini
                  </button>
                  <button
                    onClick={() => setWeek(add(week, -7))}
                    aria-label="Minggu sebelumnya"
                    className="rounded-md border border-gray-200 p-1.5"
                  >
                    <IconChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setWeek(add(week, 7))}
                    aria-label="Minggu berikutnya"
                    className="rounded-md border border-gray-200 p-1.5"
                  >
                    <IconChevronRight className="h-4 w-4" />
                  </button>
                </>
              )}
              <button
                onClick={() => setFiltersOpen((value) => !value)}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-navy-900"
              >
                Filter{activeFilters.length ? ` (${activeFilters.length})` : ""}
              </button>
            </div>
          }
        >
          {filtersOpen && (
            <div className="mb-4 grid gap-3 rounded-md border border-gray-200 bg-slate-50 p-3 sm:grid-cols-2">
              <Select
                label="Tentor"
                value={tutorId}
                change={setTutorId}
                items={tutors}
                empty="Semua Tentor"
              />
              <Select
                label="Program"
                value={program}
                change={setProgram}
                items={[
                  { id: "REGULAR", name: "Reguler" },
                  { id: "PRIVATE", name: "Privat" },
                ]}
                empty="Semua Program"
              />
              <Select
                label="Mata Pelajaran"
                value={subjectId}
                change={setSubjectId}
                items={subjects}
                empty="Semua Mapel"
              />
              <label className="text-xs font-medium text-gray-500">
                Kelas / Siswa
                <input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  className="mt-1 block h-10 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-800"
                />
              </label>
              <div className="flex items-end justify-end gap-2 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-xs"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="rounded-md bg-navy-900 px-3 py-2 text-xs font-medium text-white"
                >
                  Terapkan Filter
                </button>
              </div>
            </div>
          )}
          {activeFilters.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-gray-500">Filter aktif:</span>
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => removeFilter(filter.key)}
                  className="rounded-full border border-gray-200 bg-white px-2 py-1 text-navy-900 hover:bg-navy-50"
                >
                  {filter.label} ×
                </button>
              ))}
              <button
                onClick={clearFilters}
                className="px-1 font-medium text-navy-900 hover:underline"
              >
                Hapus semua
              </button>
            </div>
          )}
          {mode === "WEEK" && (
            <p className="mb-3 text-xs text-gray-500">
              {weekRows.length} jadwal pada minggu ini
            </p>
          )}
          {mode === "WEEK" ? (
            <Grid
              week={week}
              data={forDay}
              chosen={chosen?.id}
              choose={setChosen}
              loading={loading}
              startHour={timeRange.start}
              endHour={timeRange.end}
              filtered={activeFilters.length > 0}
            />
          ) : (
            <List
              rows={filtered}
              choose={(x) => {
                setChosen(x);
                setMode("WEEK");
              }}
            />
          )}
        </SectionCard>
        {chosen && mode === "WEEK" && (
          <Panel row={chosen} close={() => setChosen(null)} />
        )}
      </div>
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {open && (
        <Modal
          title="Tambah Jadwal"
          onClose={() => !saving && setOpen(false)}
          className="max-w-[640px]"
        >
          <form onSubmit={create} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Form label="Program">
                <select
                  value={form.sessionType}
                  onChange={(e) =>
                    setForm({ ...form, sessionType: e.target.value })
                  }
                >
                  <option value="REGULAR">Reguler</option>
                  <option value="PRIVATE">Privat</option>
                </select>
              </Form>
              <Form label="Tentor">
                <select
                  value={form.tutorId}
                  onChange={(e) =>
                    setForm({ ...form, tutorId: e.target.value })
                  }
                >
                  <option value="">Pilih tentor</option>
                  {tutors.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </Form>
              {form.sessionType === "REGULAR" ? (
                <Form label="Kelas">
                  <select
                    value={form.classId}
                    onChange={(e) =>
                      setForm({ ...form, classId: e.target.value })
                    }
                  >
                    <option value="">Pilih kelas</option>
                    {classes.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </Form>
              ) : (
                <Form label="Siswa">
                  <select
                    value={form.studentId}
                    onChange={(e) =>
                      setForm({ ...form, studentId: e.target.value })
                    }
                  >
                    <option value="">Pilih siswa</option>
                    {students.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </Form>
              )}
              <Form label="Mata Pelajaran">
                <select
                  value={form.subjectId}
                  onChange={(e) =>
                    setForm({ ...form, subjectId: e.target.value })
                  }
                >
                  <option value="">Pilih mapel</option>
                  {subjects.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </Form>
              <Form label="Hari">
                <select
                  value={form.dayOfWeek}
                  onChange={(e) =>
                    setForm({ ...form, dayOfWeek: e.target.value })
                  }
                >
                  {DAYS.map((x, i) => (
                    <option key={x} value={i}>
                      {x}
                    </option>
                  ))}
                </select>
              </Form>
              <Form label="Mulai Berlaku">
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value })
                  }
                />
              </Form>
              <Form label="Jam Mulai">
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) =>
                    setForm({ ...form, startTime: e.target.value })
                  }
                />
              </Form>
              <Form label="Jam Selesai">
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) =>
                    setForm({ ...form, endTime: e.target.value })
                  }
                />
              </Form>
              <Form label="Mode">
                <select
                  value={form.mode}
                  onChange={(e) => setForm({ ...form, mode: e.target.value })}
                >
                  <option value="OFFLINE">Offline</option>
                  <option value="ONLINE">Online</option>
                </select>
              </Form>
              {form.mode === "OFFLINE" && (
                <Form label="Lokasi">
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) =>
                      setForm({ ...form, location: e.target.value })
                    }
                    placeholder="cth. Cabang Sudirman"
                  />
                </Form>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm"
              >
                Batal
              </button>
              <button
                disabled={saving}
                className="rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white"
              >
                {saving ? "Menyimpan..." : "Simpan Jadwal"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
function Select({
  label,
  value,
  change,
  items,
  empty,
}: {
  label: string;
  value: string;
  change: (x: string) => void;
  items: Option[];
  empty: string;
}) {
  return (
    <label className="text-xs font-medium text-gray-500">
      {label}
      <select
        value={value}
        onChange={(e) => change(e.target.value)}
        className="mt-1 block h-10 min-w-36 rounded-md border border-gray-300 px-3 text-sm text-gray-800"
      >
        <option value="">{empty}</option>
        {items.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function Form({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-xs font-medium text-gray-700">
      {label}
      <span className="mt-1 block [&_input]:h-10 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-gray-300 [&_input]:px-3 [&_input]:text-sm [&_select]:h-10 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-gray-300 [&_select]:px-3 [&_select]:text-sm">
        {children}
      </span>
    </label>
  );
}
function List({
  rows,
  choose,
}: {
  rows: Schedule[];
  choose: (x: Schedule) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-gray-500">
            <th className="px-3 py-3">Hari</th>
            <th>Jam</th>
            <th>Tentor</th>
            <th>Program</th>
            <th>Kelas / Siswa</th>
            <th>Mapel</th>
            <th>Mode</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr
              key={x.id}
              onClick={() => choose(x)}
              className="cursor-pointer border-b border-gray-100 hover:bg-slate-50"
            >
              <td className="px-3 py-3">{DAYS[x.dayOfWeek]}</td>
              <td>
                {tm(x.startTime)} – {tm(x.endTime)}
              </td>
              <td>{x.tutor.name}</td>
              <td>
                <TypeBadge type={x.sessionType} />
              </td>
              <td>{x.class?.name || x.student?.name || "-"}</td>
              <td>{x.subject?.name || "-"}</td>
              <td>{x.mode === "ONLINE" ? "Online" : x.location ? `Offline · ${x.location}` : "Offline"}</td>
              <td>
                <StatusBadge status={x.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Panel({ row, close }: { row: Schedule; close: () => void }) {
  return (
    <aside className="h-fit rounded-lg border border-gray-200 bg-white">
      <div className="flex items-start justify-between border-b border-gray-100 p-4">
        <div>
          <TypeBadge type={row.sessionType} />
          <h2 className="mt-3 text-base font-semibold text-gray-900">
            {row.subject?.name || "Jadwal mengajar"}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {row.class?.name || row.student?.name || "-"}
          </p>
        </div>
        <button
          onClick={close}
          aria-label="Tutup detail"
          className="rounded p-1 text-gray-400"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-4 p-4 text-sm">
        <Info
          l="Waktu"
          v={`${DAYS[row.dayOfWeek]}, ${tm(row.startTime)} – ${tm(row.endTime)}`}
        />
        <Info l="Tentor" v={row.tutor.name} />
        <Info
          l="Program"
          v={row.sessionType === "PRIVATE" ? "Privat" : "Reguler"}
        />
        <Info
          l="Kelas / Siswa"
          v={row.class?.name || row.student?.name || "-"}
        />
        <Info l="Mata Pelajaran" v={row.subject?.name || "-"} />
        <Info
          l="Mode"
          v={row.mode === "ONLINE" ? "Online" : row.location ? `Offline – ${row.location}` : "Offline"}
        />
        {row.class?.quotaRemaining !== undefined && (
          <Info
            l="Sisa Pertemuan"
            v={`${row.class.quotaRemaining} / ${row.class.quotaTotal}`}
          />
        )}
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Status
          </p>
          <StatusBadge status={row.status} />
        </div>
      </div>
    </aside>
  );
}
function Info({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {l}
      </p>
      <p className="mt-1 font-medium text-gray-900">{v}</p>
    </div>
  );
}
function Grid({
  week,
  data,
  chosen,
  choose,
  loading,
  startHour,
  endHour,
  filtered,
}: {
  week: Date;
  data: (x: number) => Schedule[];
  chosen?: string;
  choose: (x: Schedule) => void;
  loading: boolean;
  startHour: number;
  endHour: number;
  filtered: boolean;
}) {
  const days = [1, 2, 3, 4, 5, 6, 0],
    hours = Array.from(
      { length: endHour - startHour },
      (_, i) => startHour + i,
    );
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px]">
        <div className="grid grid-cols-[62px_repeat(7,minmax(110px,1fr))] border-b border-gray-200">
          <div />
          {days.map((day) => {
            const x = add(week, (day + 6) % 7),
              today = key(x) === key(new Date());
            return (
              <div
                key={day}
                className={`px-2 py-3 text-center text-xs font-semibold ${today ? "bg-navy-50 text-navy-900" : "text-gray-600"}`}
              >
                {DAYS[day]} <span className="text-gray-900">{x.getDate()}</span>
              </div>
            );
          })}
        </div>
        <div
          className="grid grid-cols-[62px_repeat(7,minmax(110px,1fr))]"
          style={{ height: (endHour - startHour) * H }}
        >
          <div className="border-r border-gray-200">
            {hours.map((x) => (
              <div
                key={x}
                className="border-b border-gray-100 pr-2 text-right text-xs text-gray-500"
                style={{ height: H }}
              >
                {String(x).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {days.map((day) => (
            <div
              key={day}
              className="relative border-r border-gray-100 bg-[linear-gradient(to_bottom,transparent_calc(100%-1px),#f1f5f9_calc(100%-1px))] bg-[length:100%_58px]"
            >
              {data(day).map((x, i, a) => {
                const st = tv(x.startTime),
                  en = tv(x.endTime),
                  over = a.filter(
                    (y) => tv(y.startTime) < en && tv(y.endTime) > st,
                  ),
                  pos = over.findIndex((y) => y.id === x.id),
                  top = ((st - startHour * 60) / 60) * H,
                  height = Math.max(42, ((en - st) / 60) * H - 4);
                return (
                  <button
                    key={x.id}
                    onClick={() => choose(x)}
                    aria-label={`${tm(x.startTime)} ${x.sessionType} ${x.tutor.name}`}
                    className={`absolute overflow-hidden rounded-md border p-2 text-left text-[11px] ${chosen === x.id ? "ring-2 ring-navy-700" : ""} ${x.status === "CANCELLED" || x.status === "INACTIVE" ? "border-gray-200 bg-gray-100 text-gray-500" : x.sessionType === "PRIVATE" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-blue-200 bg-blue-50 text-navy-950"}`}
                    style={{
                      top,
                      left: `calc(${(pos * 100) / over.length}% + 3px)`,
                      width: `calc(${100 / over.length}% - 6px)`,
                      height,
                    }}
                  >
                    <span className="block text-[9px] font-semibold uppercase tracking-wide opacity-70">
                      {x.sessionType === "PRIVATE" ? "Privat" : "Reguler"}
                    </span>
                    <span className="mt-1 block font-medium">
                      {tm(x.startTime)} – {tm(x.endTime)}
                    </span>
                    <span className="mt-1 block font-semibold">
                      {x.subject?.name || "Tanpa mapel"}
                    </span>
                    <span className="block truncate">
                      {x.class?.name || x.student?.name || "-"}
                    </span>
                    <span className="block truncate text-[10px] opacity-75">
                      {x.tutor.name}
                    </span>
                    {x.class?.quotaRemaining !== undefined && height > 72 && (
                      <span className="mt-1 block text-[10px] opacity-75">
                        {x.class.quotaRemaining} / {x.class.quotaTotal} sesi
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {!loading && days.every((day) => data(day).length === 0) && (
          <p className="py-3 text-center text-sm text-gray-500">
            {filtered
              ? "Tidak ada jadwal yang sesuai dengan filter."
              : "Belum ada jadwal pada minggu ini."}
          </p>
        )}
      </div>
    </div>
  );
}
