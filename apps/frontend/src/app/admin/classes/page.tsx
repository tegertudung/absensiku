"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import Modal from "@/components/Modal";
import PageHeader from "@/components/PageHeader";
import SectionCard from "@/components/SectionCard";
import EmptyState from "@/components/EmptyState";
import AdminTableActions from "@/components/TableActionMenu";
import { IconPlus, IconReport } from "@/components/icons";

type Subject = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};
type Student = { id: string; name: string; status: string };
type Enrollment = {
  id: string;
  studentId: string;
  status: string;
  student: Student;
};
type ClassItem = {
  id: string;
  name: string;
  level: string | null;
  quotaTotal: number;
  quotaRemaining: number;
  status: string;
  _count: { enrollments: number };
};
type ClassDetail = ClassItem & { enrollments: Enrollment[] };

const emptyClassForm = { name: "", level: "", studentIds: [] as string[] };

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function AdminClassesPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subjectModal, setSubjectModal] = useState(false);
  const [subjectForm, setSubjectForm] = useState({
    id: "",
    name: "",
    description: "",
  });
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [classModal, setClassModal] = useState(false);
  const [classForm, setClassForm] = useState(emptyClassForm);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [classError, setClassError] = useState<string | null>(null);
  const [studentQuery, setStudentQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClassItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [subjectRes, classRes, studentRes] = await Promise.all([
        api.get("/subjects"),
        api.get("/classes"),
        api.get("/students"),
      ]);
      setSubjects(subjectRes.data.data);
      setClasses(classRes.data.data);
      setStudents(studentRes.data.data);
    } catch {
      setLoadError("Gagal memuat data kelas dan mata pelajaran.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  const activeStudents = useMemo(
    () => students.filter((student) => student.status === "ACTIVE"),
    [students],
  );
  const visibleStudents = useMemo(
    () =>
      activeStudents.filter((student) =>
        student.name.toLowerCase().includes(studentQuery.toLowerCase()),
      ),
    [activeStudents, studentQuery],
  );

  function openNewClass() {
    setEditingClassId(null);
    setClassForm(emptyClassForm);
    setClassError(null);
    setStudentQuery("");
    setClassModal(true);
  }
  async function openEditClass(item: ClassItem) {
    setEditingClassId(item.id);
    setClassError(null);
    setStudentQuery("");
    setClassModal(true);
    setSaving(true);
    try {
      const response = await api.get(`/classes/${item.id}`);
      const data: ClassDetail = response.data.data;
      setClassForm({
        name: data.name,
        level: data.level || "",
        studentIds: data.enrollments.map((enrollment) => enrollment.studentId),
      });
    } catch (error: any) {
      setClassError(
        error.response?.data?.message || "Gagal memuat detail kelas.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function openDetail(item: ClassItem) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const response = await api.get(`/classes/${item.id}`);
      setDetail(response.data.data);
    } catch {
      setLoadError("Gagal memuat detail kelas.");
    } finally {
      setDetailLoading(false);
    }
  }
  function toggleStudent(studentId: string) {
    setClassForm((form) => ({
      ...form,
      studentIds: form.studentIds.includes(studentId)
        ? form.studentIds.filter((id) => id !== studentId)
        : [...form.studentIds, studentId],
    }));
  }

  async function saveClass(event: React.FormEvent) {
    event.preventDefault();
    setClassError(null);
    if (classForm.name.trim().length < 2)
      return setClassError("Nama kelas minimal 2 karakter.");
    setSaving(true);
    try {
      const payload = {
        name: classForm.name.trim(),
        level: classForm.level.trim() || undefined,
        studentIds: classForm.studentIds,
      };
      if (editingClassId) await api.put(`/classes/${editingClassId}`, payload);
      else await api.post("/classes", payload);
      setClassModal(false);
      await load();
    } catch (error: any) {
      setClassError(error.response?.data?.message || "Gagal menyimpan kelas.");
    } finally {
      setSaving(false);
    }
  }
  async function saveSubject(event: React.FormEvent) {
    event.preventDefault();
    setSubjectError(null);
    if (subjectForm.name.trim().length < 2)
      return setSubjectError("Nama mata pelajaran minimal 2 karakter.");
    setSaving(true);
    try {
      const payload = {
        name: subjectForm.name.trim(),
        description: subjectForm.description.trim() || undefined,
      };
      if (subjectForm.id) await api.put(`/subjects/${subjectForm.id}`, payload);
      else await api.post("/subjects", payload);
      setSubjectModal(false);
      await load();
    } catch (error: any) {
      setSubjectError(
        error.response?.data?.message || "Gagal menyimpan mata pelajaran.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function deleteClass() {
    if (!deleteTarget) return;
    setClassError(null);
    setSaving(true);
    try {
      await api.delete(`/classes/${deleteTarget.id}`);
      setDeleteTarget(null);
      await load();
    } catch (error: any) {
      setClassError(error.response?.data?.message || "Gagal menghapus kelas.");
    } finally {
      setSaving(false);
    }
  }
  async function deleteSubject(subject: Subject) {
    if (!confirm(`Hapus mata pelajaran "${subject.name}"?`)) return;
    try {
      await api.delete(`/subjects/${subject.id}`);
      await load();
    } catch (error: any) {
      setLoadError(
        error.response?.data?.message || "Mata pelajaran tidak dapat dihapus.",
      );
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kelas & Mapel"
        description="Kelola kelas, mata pelajaran, dan kuota pertemuan."
        action={
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSubjectForm({ id: "", name: "", description: "" });
                setSubjectError(null);
                setSubjectModal(true);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-navy-900 px-4 text-sm font-medium text-navy-900 hover:bg-navy-50"
            >
              <IconReport className="h-4 w-4" />
              Tambah Mapel
            </button>
            <button
              onClick={openNewClass}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800"
            >
              <IconPlus className="h-4 w-4" />
              Tambah Kelas
            </button>
          </div>
        }
      />
      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}
      <SectionCard
        title="Mata Pelajaran"
        description="Master data mata pelajaran yang tersedia untuk jadwal dan sesi."
      >
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-slate-50 text-left text-xs text-gray-500">
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Deskripsi</th>
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {subjects.length ? (
                subjects.map((subject) => (
                  <tr
                    key={subject.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {subject.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {subject.description || "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AdminTableActions
                        ariaLabel={`Aksi untuk ${subject.name}`}
                        onEdit={() => {
                          setSubjectForm({
                            id: subject.id,
                            name: subject.name,
                            description: subject.description || "",
                          });
                          setSubjectError(null);
                          setSubjectModal(true);
                        }}
                        onDelete={() => deleteSubject(subject)}
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-6 text-center text-sm text-gray-400"
                  >
                    Belum ada mata pelajaran.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
      <SectionCard
        title="Kelas Reguler"
        description="Kelas adalah kelompok belajar; kuota pertemuan melekat pada kelas."
      >
        {loading ? (
          <p className="py-6 text-center text-sm text-gray-400">
            Memuat kelas...
          </p>
        ) : classes.length === 0 ? (
          <EmptyState
            title="Belum ada kelas reguler"
            message="Tambahkan kelas untuk mulai mengelola kelompok belajar."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-slate-50 text-left text-xs text-gray-500">
                  <th className="px-4 py-3 font-medium">Nama Kelas</th>
                  <th className="px-4 py-3 font-medium">Jenjang</th>
                  <th className="px-4 py-3 font-medium">Jumlah Siswa</th>
                  <th className="px-4 py-3 font-medium">Sisa Pertemuan</th>
                  <th className="px-4 py-3 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {item.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {item.level || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {item._count.enrollments} siswa
                    </td>
                    <td
                      className={`px-4 py-3 font-medium ${item.quotaRemaining === 0 ? "text-red-700" : item.quotaRemaining <= 3 ? "text-amber-700" : "text-gray-700"}`}
                    >
                      {item.quotaRemaining} / {item.quotaTotal}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AdminTableActions
                        ariaLabel={`Aksi untuk ${item.name}`}
                        onDetail={() => openDetail(item)}
                        onEdit={() => openEditClass(item)}
                        onDelete={() => {
                          setClassError(null);
                          setDeleteTarget(item);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      {subjectModal && (
        <Modal
          title={
            subjectForm.id ? "Edit Mata Pelajaran" : "Tambah Mata Pelajaran"
          }
          onClose={() => setSubjectModal(false)}
        >
          <form onSubmit={saveSubject} className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Nama
              <input
                value={subjectForm.name}
                onChange={(event) =>
                  setSubjectForm({ ...subjectForm, name: event.target.value })
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Deskripsi{" "}
              <span className="font-normal text-gray-400">(opsional)</span>
              <input
                value={subjectForm.description}
                onChange={(event) =>
                  setSubjectForm({
                    ...subjectForm,
                    description: event.target.value,
                  })
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            {subjectError && (
              <p className="text-sm text-red-600">{subjectError}</p>
            )}
            <div className="flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() => setSubjectModal(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm"
              >
                Batal
              </button>
              <button
                disabled={saving}
                className="rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {classModal && (
        <Modal
          title={editingClassId ? "Edit Kelas" : "Tambah Kelas"}
          onClose={() => !saving && setClassModal(false)}
        >
          <form onSubmit={saveClass} className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Nama Kelas *
              <input
                value={classForm.name}
                onChange={(event) =>
                  setClassForm({ ...classForm, name: event.target.value })
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Contoh: Reguler A"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Jenjang{" "}
              <span className="font-normal text-gray-400">(opsional)</span>
              <input
                value={classForm.level}
                onChange={(event) =>
                  setClassForm({ ...classForm, level: event.target.value })
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Contoh: SMP"
              />
            </label>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Siswa
              </label>
              <input
                value={studentQuery}
                onChange={(event) => setStudentQuery(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Cari dan pilih siswa"
              />
              <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-gray-200">
                {visibleStudents.length ? (
                  visibleStudents.map((student) => (
                    <label
                      key={student.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 text-sm last:border-0 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={classForm.studentIds.includes(student.id)}
                        onChange={() => toggleStudent(student.id)}
                        className="h-4 w-4"
                      />
                      <span>{student.name}</span>
                    </label>
                  ))
                ) : (
                  <p className="px-3 py-4 text-sm text-gray-400">
                    Belum ada siswa aktif yang dapat dipilih.
                  </p>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {classForm.studentIds.length} siswa dipilih
              </p>
            </div>
            {classError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {classError}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() => setClassModal(false)}
                disabled={saving}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm"
              >
                Batal
              </button>
              <button
                disabled={saving}
                className="rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving
                  ? "Menyimpan..."
                  : editingClassId
                    ? "Simpan Perubahan"
                    : "Simpan Kelas"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {(detail || detailLoading) && (
        <Modal
          title="Detail Kelas"
          onClose={() => {
            setDetail(null);
            setDetailLoading(false);
          }}
        >
          <>
            {detailLoading ? (
              <p className="text-sm text-gray-400">Memuat detail kelas...</p>
            ) : (
              detail && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {detail.name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {detail.level || "Jenjang belum diisi"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="text-xs text-gray-500">Jumlah Siswa</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">
                        {detail._count.enrollments}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="text-xs text-gray-500">Sisa Pertemuan</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">
                        {detail.quotaRemaining} / {detail.quotaTotal}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Daftar Siswa
                    </p>
                    {detail.enrollments.length ? (
                      <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                        {detail.enrollments.map((enrollment) => (
                          <li
                            key={enrollment.id}
                            className="flex items-center gap-3 px-3 py-2"
                          >
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-50 text-xs font-semibold text-navy-900">
                              {initials(enrollment.student.name)}
                            </span>
                            <span className="text-sm text-gray-800">
                              {enrollment.student.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-400">
                        Belum ada siswa terdaftar.
                      </p>
                    )}
                  </div>
                </div>
              )
            )}
          </>
        </Modal>
      )}
      {deleteTarget && (
        <Modal
          title="Hapus Kelas?"
          onClose={() => !saving && setDeleteTarget(null)}
        >
          <p className="text-sm leading-6 text-gray-600">
            Kelas “{deleteTarget.name}” akan dihapus. Kelas yang memiliki jadwal
            atau riwayat sesi tetap dilindungi.
          </p>
          {classError && (
            <p className="mt-3 text-sm text-red-600">{classError}</p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={saving}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm"
            >
              Batal
            </button>
            <button
              onClick={deleteClass}
              disabled={saving}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Menghapus..." : "Hapus"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
