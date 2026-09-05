"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";

interface Program {
  id: string;
  name: string;
  learningModel: "CLASS_BASED" | "INDIVIDUAL";
  isActive: boolean;
}

interface ProgramSummary {
  id: string;
  status: string;
  programId: string;
  program: Program;
  class: { id: string; name: string } | null;
  quota: { quotaTotal: number; quotaRemaining: number };
}

interface SessionRow {
  id: string;
  sessionDate: string;
  status: string;
  programId: string | null;
  program: { id: string; name: string } | null;
  tutor: { name: string };
  subject: { name: string } | null;
}

interface StudentDetail {
  id: string;
  studentCode: string;
  name: string;
  phone: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  status: string;
  programSummaries: ProgramSummary[];
  sessionHistory: SessionRow[];
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif",
  INACTIVE: "Nonaktif",
  GRADUATED: "Lulus",
};

export default function AdminStudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.id as string;
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [programFilter, setProgramFilter] = useState("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/students/${studentId}`);
      setStudent(response.data.data);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleSessions = useMemo(
    () =>
      (student?.sessionHistory || []).filter(
        (session) =>
          programFilter === "ALL" || session.programId === programFilter,
      ),
    [programFilter, student?.sessionHistory],
  );

  if (loading) return <p className="text-sm text-gray-400">Memuat...</p>;
  if (!student)
    return <p className="text-sm text-red-500">Siswa tidak ditemukan.</p>;

  return (
    <div>
      <button
        onClick={() => router.push("/admin/students")}
        className="mb-4 text-xs text-blue-600"
      >
        ← Kembali ke Data Siswa
      </button>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {student.name}
            </h1>
            <p className="mt-1 text-xs font-semibold text-navy-700">
              Kode Siswa: {student.studentCode}
            </p>
            {student.phone ? (
              <p className="text-sm text-gray-500">{student.phone}</p>
            ) : null}
            {student.guardianName ? (
              <p className="text-sm text-gray-500">
                Wali: {student.guardianName}
                {student.guardianPhone ? ` (${student.guardianPhone})` : ""}
              </p>
            ) : null}
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${student.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
          >
            {STATUS_LABELS[student.status] ?? student.status}
          </span>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Program Diikuti</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {student.programSummaries.length}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Total Sesi Selesai</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {student.sessionHistory.length}
          </p>
        </div>
      </div>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-medium text-gray-900">
          Program Belajar
        </h2>
        <div className="space-y-3">
          {student.programSummaries.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-400">
              Belum ada program belajar.
            </div>
          ) : (
            student.programSummaries.map((enrollment) => (
              <article
                key={enrollment.id}
                className="rounded-lg border border-gray-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {enrollment.program.name}
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">
                      {enrollment.program.learningModel === "CLASS_BASED"
                        ? `Berbasis Kelas · Kelas: ${enrollment.class?.name || "Belum dipilih"}`
                        : "Individual"}
                    </p>
                  </div>
                  {!enrollment.program.isActive ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      Nonaktif
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm font-medium text-gray-800">
                  Sisa Sesi: {enrollment.quota.quotaRemaining} /{" "}
                  {enrollment.quota.quotaTotal}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-gray-900">Riwayat Sesi</h2>
          {student.programSummaries.length > 1 ? (
            <select
              value={programFilter}
              onChange={(event) => setProgramFilter(event.target.value)}
              aria-label="Filter riwayat berdasarkan program"
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"
            >
              <option value="ALL">Semua Program</option>
              {student.programSummaries.map((enrollment) => (
                <option key={enrollment.programId} value={enrollment.programId}>
                  {enrollment.program.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">Program</th>
                <th className="px-4 py-3 font-medium">Tentor</th>
                <th className="px-4 py-3 font-medium">Mapel</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleSessions.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-gray-400"
                  >
                    {programFilter === "ALL"
                      ? "Belum ada histori sesi."
                      : "Belum ada histori sesi untuk program ini."}
                  </td>
                </tr>
              ) : (
                visibleSessions.map((session) => (
                  <tr
                    key={session.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(session.sessionDate)}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {session.program?.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {session.tutor.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {session.subject?.name || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={session.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
