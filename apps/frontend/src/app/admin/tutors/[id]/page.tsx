"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { formatDate, formatRupiah } from "@/lib/format";
import Modal from "@/components/Modal";
import { StatusBadge, TypeBadge } from "@/components/StatusBadge";

interface TutorDetail {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  user: { email: string; isActive: boolean; lastLogin: string | null };
  subjects: { subject: { id: string; name: string } }[];
}
interface ScheduleRow {
  id: string;
  sessionType: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  status: string;
  class: { name: string } | null;
  student: { name: string } | null;
  subject: { name: string } | null;
}
interface SessionRow {
  id: string;
  sessionDate: string;
  sessionType: string;
  status: string;
  honorRateSnapshot: string | null;
  class: { name: string } | null;
  student: { name: string } | null;
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
function formatTime(iso: string) {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function AdminTutorDetailPage() {
  const { id: tutorId } = useParams<{ id: string }>();
  const router = useRouter();
  const [tutor, setTutor] = useState<TutorDetail | null>(null);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tutorRes, scheduleRes, sessionRes] = await Promise.all([
        api.get(`/tutors/${tutorId}`),
        api.get("/schedules", { params: { tutorId } }),
        api.get("/sessions", { params: { tutorId } }),
      ]);
      setTutor(tutorRes.data.data);
      setSchedules(scheduleRes.data.data);
      setSessions(sessionRes.data.data);
    } finally {
      setLoading(false);
    }
  }, [tutorId]);
  useEffect(() => {
    load();
  }, [load]);

  async function deleteTutor() {
    if (!tutor) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await api.delete(`/tutors/${tutor.id}`);
      router.push("/admin/tutors");
      router.refresh();
    } catch (error: any) {
      setDeleteError(
        error.response?.data?.message || "Gagal menghapus tentor.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const completedSessions = sessions.filter(
    (session) => session.status === "COMPLETED",
  );
  const totalHonor = completedSessions.reduce(
    (sum, session) => sum + Number(session.honorRateSnapshot || 0),
    0,
  );
  if (loading) return <p className="text-sm text-gray-400">Memuat...</p>;
  if (!tutor)
    return <p className="text-sm text-red-500">Tentor tidak ditemukan.</p>;

  return (
    <div>
      <button
        onClick={() => router.push("/admin/tutors")}
        className="mb-4 text-xs text-blue-600"
      >
        ← Kembali ke Data Tentor
      </button>
      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-gray-500">
              Admin / Tentor / Detail
            </p>
            <h1 className="mt-1 text-lg font-semibold text-gray-900">
              Detail Tentor
            </h1>
            <p className="mt-3 font-medium text-gray-900">{tutor.name}</p>
            <p className="text-sm text-gray-500">{tutor.user.email}</p>
            {tutor.phone && (
              <p className="text-sm text-gray-500">{tutor.phone}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${tutor.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
            >
              {tutor.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
            </span>
            <button
              onClick={() => router.push(`/admin/tutors/${tutor.id}/edit`)}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              Edit Tentor
            </button>
            <div className="relative">
              <button
                aria-label="Aksi tentor"
                aria-expanded={showMenu}
                onClick={() => setShowMenu(!showMenu)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                ⋮
              </button>
              {showMenu && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setDeleteError("");
                    setConfirmDelete(true);
                  }}
                  className="absolute right-0 z-10 mt-1 w-32 rounded-lg border bg-white px-3 py-2 text-left text-sm text-red-600 shadow-lg"
                >
                  Hapus Tentor
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="mt-5 border-t pt-4">
          <h2 className="text-sm font-medium text-gray-900">
            Mata Pelajaran yang Diajar
          </h2>
          {tutor.subjects.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {tutor.subjects.map((item) => (
                <span
                  key={item.subject.id}
                  className="rounded-full bg-navy-50 px-2.5 py-1 text-xs text-navy-900"
                >
                  {item.subject.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-400">
              Belum ada mata pelajaran yang ditetapkan.
            </p>
          )}
        </div>
      </section>
      <div className="mb-6 grid grid-cols-2 gap-4">
        <Stat label="Total Sesi Selesai" value={completedSessions.length} />
        <Stat label="Total Estimasi Honor" value={formatRupiah(totalHonor)} />
      </div>
      <h2 className="mb-3 text-sm font-medium text-gray-900">
        Jadwal Mengajar
      </h2>
      <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="px-4 py-3">Hari/Jam</th>
              <th>Jenis</th>
              <th>Kelas/Siswa</th>
              <th>Mapel</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {schedules.length ? (
              schedules.map((schedule) => (
                <tr key={schedule.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-gray-600">
                    {DAY_NAMES[schedule.dayOfWeek]},{" "}
                    {formatTime(schedule.startTime)}–
                    {formatTime(schedule.endTime)}
                  </td>
                  <td>
                    <TypeBadge type={schedule.sessionType} />
                  </td>
                  <td className="text-gray-600">
                    {schedule.sessionType === "REGULAR"
                      ? schedule.class?.name
                      : schedule.student?.name}
                  </td>
                  <td className="text-gray-600">
                    {schedule.subject?.name || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={schedule.status} />
                  </td>
                </tr>
              ))
            ) : (
              <EmptyRow columns={5} text="Belum ada jadwal." />
            )}
          </tbody>
        </table>
      </div>
      <h2 className="mb-3 text-sm font-medium text-gray-900">
        Histori Mengajar
      </h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="px-4 py-3">Tanggal</th>
              <th>Jenis</th>
              <th>Kelas/Siswa</th>
              <th>Status</th>
              <th className="px-4 py-3">Honor</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length ? (
              sessions.map((session) => (
                <tr key={session.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(session.sessionDate)}
                  </td>
                  <td>
                    <TypeBadge type={session.sessionType} />
                  </td>
                  <td className="text-gray-600">
                    {session.sessionType === "REGULAR"
                      ? session.class?.name
                      : session.student?.name}
                  </td>
                  <td>
                    <StatusBadge status={session.status} />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {session.status === "COMPLETED"
                      ? formatRupiah(session.honorRateSnapshot)
                      : "-"}
                  </td>
                </tr>
              ))
            ) : (
              <EmptyRow columns={5} text="Belum ada histori mengajar." />
            )}
          </tbody>
        </table>
      </div>
      {confirmDelete && (
        <Modal
          title="Hapus Tentor"
          onClose={() => !deleting && setConfirmDelete(false)}
        >
          <div className="space-y-4 text-sm text-gray-600">
            <p>
              Anda akan menghapus <strong>{tutor.name}</strong> dari daftar
              pengajar aktif.
            </p>
            <p>
              Tentor tidak dapat menerima jadwal baru atau mengakses sistem
              setelah dihapus. Riwayat mengajar, validasi, rekap honor, dan slip
              yang telah tercatat tetap disimpan.
            </p>
            {deleteError && <p className="text-red-600">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
                className="rounded border px-4 py-2"
              >
                Batal
              </button>
              <button
                disabled={deleting}
                onClick={deleteTutor}
                className="rounded bg-red-600 px-4 py-2 text-white"
              >
                {deleting ? "Menghapus..." : "Hapus Tentor"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
function EmptyRow({ columns, text }: { columns: number; text: string }) {
  return (
    <tr>
      <td colSpan={columns} className="px-4 py-6 text-center text-gray-400">
        {text}
      </td>
    </tr>
  );
}
