"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import Modal from "@/components/Modal";
import { formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { IconPlus, IconSearch } from "@/components/icons";
import AdminTableActions from "@/components/TableActionMenu";
import StatCard from "@/components/StatCard";
import { IconClasses } from "@/components/icons";

interface Student {
  id: string;
  studentCode: string;
  name: string;
  phone: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  nis: string | null;
  school: string | null;
  schoolClass: string | null;
  status: string;
  hasOperationalHistory: boolean;
  programEnrollments: ProgramEnrollment[];
}

interface PrivatePackage {
  id: string;
  quotaTotal: number;
  quotaUsed: number;
  quotaRemaining: number;
  status: string;
  packageName: string | null;
  activationDate: string;
}

interface ClassOption {
  id: string;
  name: string;
  programId: string | null;
  status: string;
  subject: { name: string } | null;
}

interface ProgramOption {
  id: string;
  code: string;
  name: string;
  learningModel: "CLASS_BASED" | "INDIVIDUAL";
  isActive: boolean;
}

interface ProgramEnrollment {
  id?: string;
  programId: string;
  classId: string | null;
  status?: string;
  program?: ProgramOption;
  class?: ClassOption | null;
}

type ProgramEnrollmentInput = Pick<ProgramEnrollment, "programId" | "classId">;

const STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "GRADUATED"];
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif",
  INACTIVE: "Nonaktif",
  GRADUATED: "Lulus",
};

const PACKAGE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif",
  EXPIRED: "Habis Masa",
  CANCELLED: "Dibatalkan",
};

function ProgramEnrollmentFields({
  programs,
  classes,
  enrollments,
  disabled,
  classesLoading,
  error,
  onChange,
}: {
  programs: ProgramOption[];
  classes: ClassOption[];
  enrollments: ProgramEnrollmentInput[];
  disabled: boolean;
  classesLoading: boolean;
  error: string | null;
  onChange: (enrollments: ProgramEnrollmentInput[]) => void;
}) {
  const selected = (programId: string) =>
    enrollments.find((enrollment) => enrollment.programId === programId);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Program Belajar</h2>
        <p className="mt-1 text-xs leading-5 text-gray-500">
          Pilih satu atau beberapa program yang diikuti siswa.
        </p>
      </div>
      <fieldset disabled={disabled}>
        <legend className="sr-only">Pilih program belajar</legend>
        <div className="space-y-3">
          {programs.map((program) => {
            const enrollment = selected(program.id);
            const availableClasses = classes.filter(
              (classItem) => classItem.status !== "INACTIVE",
            );
            const isClassBased = program.learningModel === "CLASS_BASED";
            return (
              <div
                key={program.id}
                className={`rounded-lg border p-3 ${enrollment ? "border-navy-600 bg-navy-50" : "border-gray-200"}`}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(enrollment)}
                    onChange={() =>
                      onChange(
                        enrollment
                          ? enrollments.filter(
                              (item) => item.programId !== program.id,
                            )
                          : [
                              ...enrollments,
                              { programId: program.id, classId: null },
                            ],
                      )
                    }
                    className="mt-0.5 h-4 w-4 border-gray-300 text-navy-700 focus:ring-navy-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">
                      {program.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {isClassBased ? "Berbasis Kelas" : "Individual"}
                      {!program.isActive ? " · Nonaktif" : ""}
                    </span>
                  </span>
                </label>
                {enrollment && isClassBased ? (
                  <label className="mt-3 block text-xs font-medium text-gray-700">
                    Kelas <span className="text-red-600">*</span>
                    <select
                      value={enrollment.classId || ""}
                      onChange={(event) =>
                        onChange(
                          enrollments.map((item) =>
                            item.programId === program.id
                              ? { ...item, classId: event.target.value || null }
                              : item,
                          ),
                        )
                      }
                      disabled={classesLoading || availableClasses.length === 0}
                      className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-normal text-gray-900"
                    >
                      <option value="">
                        {classesLoading
                          ? "Memuat kelas..."
                          : availableClasses.length
                            ? `Pilih kelas ${program.name}`
                            : "Belum ada kelas tersedia."}
                      </option>
                      {availableClasses.map((classItem) => (
                        <option key={classItem.id} value={classItem.id}>
                          {classItem.name}
                        </option>
                      ))}
                    </select>
                    {availableClasses.length === 0 && !classesLoading ? (
                      <span className="mt-1 block font-normal text-red-700">
                        Belum ada kelas tersedia.
                      </span>
                    ) : null}
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="mt-3 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function ProgramClassSelectors({
  programs,
  classes,
  enrollments,
  disabled,
  onChange,
}: {
  programs: ProgramOption[];
  classes: ClassOption[];
  enrollments: ProgramEnrollmentInput[];
  disabled: boolean;
  onChange: (programId: string, classId: string | null) => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      {enrollments.map((enrollment) => {
        const program = programs.find(
          (item) => item.id === enrollment.programId,
        );
        if (!program || program.learningModel !== "CLASS_BASED") return null;
        const availableClasses = classes.filter(
          (classItem) => classItem.status !== "INACTIVE",
        );
        return (
          <label
            key={program.id}
            className="block rounded-lg border border-gray-200 p-3 text-xs font-medium text-gray-700"
          >
            Kelas {program.name} <span className="text-red-600">*</span>
            <select
              value={enrollment.classId || ""}
              onChange={(event) =>
                onChange(program.id, event.target.value || null)
              }
              disabled={disabled || availableClasses.length === 0}
              className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-normal text-gray-900"
            >
              <option value="">
                {availableClasses.length
                  ? `Pilih kelas ${program.name}`
                  : "Belum ada kelas tersedia."}
              </option>
              {availableClasses.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
                </option>
              ))}
            </select>
            {availableClasses.length === 0 ? (
              <span className="mt-1 block font-normal text-red-700">
                Belum ada kelas tersedia.
              </span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const createInFlightRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [programError, setProgramError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [programFilter, setProgramFilter] = useState("ALL");
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    guardianName: "",
    guardianPhone: "",
    classId: "",
  });
  const [editProgramEnrollments, setEditProgramEnrollments] = useState<
    ProgramEnrollmentInput[]
  >([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [packageConfirm, setPackageConfirm] = useState<
    "ACTIVATE" | "EXTEND" | null
  >(null);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    guardianName: "",
    guardianPhone: "",
  });
  const [programOptions, setProgramOptions] = useState<ProgramOption[]>([]);
  const [programEnrollments, setProgramEnrollments] = useState<
    Array<{ programId: string; classId: string | null }>
  >([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [createdStudentId, setCreatedStudentId] = useState<string | null>(null);

  const [pkgStudent, setPkgStudent] = useState<Student | null>(null);
  const [packages, setPackages] = useState<PrivatePackage[]>([]);
  const [pkgLoading, setPkgLoading] = useState(false);
  const [pkgError, setPkgError] = useState<string | null>(null);
  const [pkgBusy, setPkgBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, programsRes] = await Promise.all([
        api.get("/students"),
        api.get("/programs", { params: { active: "true" } }),
      ]);
      setStudents(res.data.data);
      setProgramOptions(programsRes.data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function loadClasses() {
    setClassesLoading(true);
    try {
      const res = await api.get("/classes");
      setClasses(res.data.data);
    } catch {
      setProgramError("Gagal memuat kelas. Silakan coba lagi.");
    } finally {
      setClassesLoading(false);
    }
  }

  function resetCreateForm() {
    setForm({ name: "", phone: "", guardianName: "", guardianPhone: "" });
    setProgramEnrollments([]);
    setCreatedStudentId(null);
    setFormError(null);
    setPhoneError(null);
    setProgramError(null);
  }

  async function openCreateForm() {
    setSuccessMessage(null);
    resetCreateForm();
    setShowForm(true);
    await Promise.all([
      loadClasses(),
      api
        .get("/programs", { params: { active: "true" } })
        .then((res) => setProgramOptions(res.data.data)),
    ]);
  }

  async function closeCreateForm() {
    if (saving || createInFlightRef.current) return;
    setShowForm(false);
    if (createdStudentId) await load();
    resetCreateForm();
  }

  function validateProgram(enrollments: ProgramEnrollmentInput[]) {
    if (!enrollments.length) {
      setProgramError("Pilih minimal satu program belajar.");
      return false;
    }
    const invalidEnrollment = enrollments.find((enrollment) => {
      const program = programOptions.find(
        (item) => item.id === enrollment.programId,
      );
      return program?.learningModel === "CLASS_BASED" && !enrollment.classId;
    });
    if (invalidEnrollment) {
      const program = programOptions.find(
        (item) => item.id === invalidEnrollment.programId,
      );
      setProgramError(`Pilih kelas untuk program ${program?.name || "ini"}.`);
      return false;
    }
    return true;
  }

  async function finishCreate() {
    setSuccessMessage("Siswa dan program belajar berhasil ditambahkan.");
    setShowForm(false);
    resetCreateForm();
    await load();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    setProgramError(null);

    if (!createdStudentId && (!form.name || form.name.trim().length < 2)) {
      setFormError("Nama siswa minimal 2 karakter");
      return;
    }
    const normalizedPhone = form.phone.replace(/\D/g, "");
    if (!normalizedPhone) {
      setPhoneError("Nomor telepon wajib diisi.");
      return;
    }
    if (normalizedPhone.length > 13) {
      setPhoneError("Nomor telepon maksimal 13 digit.");
      return;
    }
    setPhoneError(null);
    if (!validateProgram(programEnrollments)) return;

    createInFlightRef.current = true;
    setSaving(true);
    try {
      const studentId =
        createdStudentId ||
        (
          await api.post("/students", {
            ...form,
            phone: normalizedPhone,
            programEnrollments,
          })
        ).data.data.id;
      if (!createdStudentId) setCreatedStudentId(studentId);

      await finishCreate();
    } catch (err: any) {
      setFormError(err.response?.data?.message || "Gagal menambah siswa");
    } finally {
      createInFlightRef.current = false;
      setSaving(false);
    }
  }

  async function changeStatus(student: Student, status: string) {
    if (status === student.status) return;
    setBusyId(student.id);
    try {
      await api.patch(`/students/${student.id}/status`, { status });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function openPackages(student: Student) {
    setPkgStudent(student);
    setPkgError(null);
    setPkgLoading(true);
    try {
      const res = await api.get("/private-packages", {
        params: { studentId: student.id },
      });
      setPackages(res.data.data);
    } finally {
      setPkgLoading(false);
    }
  }

  async function refreshPackages() {
    if (!pkgStudent) return;
    const res = await api.get("/private-packages", {
      params: { studentId: pkgStudent.id },
    });
    setPackages(res.data.data);
  }

  async function activatePackage() {
    if (!pkgStudent) return;
    setPkgBusy(true);
    setPkgError(null);
    try {
      await api.post("/private-packages", {
        studentId: pkgStudent.id,
        quotaTotal: 24,
      });
      setPackageConfirm(null);
      await refreshPackages();
    } catch (err: any) {
      setPkgError(err.response?.data?.message || "Gagal mengaktifkan paket");
    } finally {
      setPkgBusy(false);
    }
  }

  async function extendActivePackage(pkgId: string) {
    setPkgBusy(true);
    setPkgError(null);
    try {
      await api.post(`/private-packages/${pkgId}/extend`, {
        additionalQuota: 24,
      });
      setPackageConfirm(null);
      await refreshPackages();
    } catch (err: any) {
      setPkgError(err.response?.data?.message || "Gagal menambah kuota");
    } finally {
      setPkgBusy(false);
    }
  }

  const activePackage = packages.find((p) => p.status === "ACTIVE");
  const visibleStudents = students.filter((student) => {
    const query = search.toLocaleLowerCase();
    const matchesSearch =
      student.studentCode.toLocaleLowerCase().includes(query) ||
      student.name.toLocaleLowerCase().includes(query) ||
      (student.phone || "").includes(search);
    const matchesStatus =
      statusFilter === "ALL" || student.status === statusFilter;
    const matchesProgram =
      programFilter === "ALL" ||
      student.programEnrollments.some(
        (enrollment) =>
          enrollment.programId === programFilter &&
          enrollment.status !== "INACTIVE",
      );
    return matchesSearch && matchesStatus && matchesProgram;
  });

  function initials(name: string) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }

  async function deleteStudent() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await api.delete(`/students/${deleteTarget.id}`);
      setDeleteTarget(null);
      setDeleteAcknowledged(false);
      setSuccessMessage("Siswa berhasil dihapus permanen.");
      await load();
    } catch (err: any) {
      setActionError(err.response?.data?.message || "Gagal menghapus siswa.");
      setDeleteTarget(null);
    } finally {
      setBusyId(null);
    }
  }

  async function openEdit(student: Student) {
    setEditError(null);
    const [detailRes, , programsRes] = await Promise.all([
      api.get(`/students/${student.id}`),
      loadClasses(),
      api.get("/programs", { params: { active: "true" } }),
    ]);
    const detail = detailRes.data.data as {
      programEnrollments?: ProgramEnrollment[];
    };
    const existingPrograms = (detail.programEnrollments || [])
      .map((enrollment) => enrollment.program)
      .filter((program): program is ProgramOption => Boolean(program));
    const activePrograms = programsRes.data.data as ProgramOption[];
    setProgramOptions([
      ...activePrograms,
      ...existingPrograms.filter(
        (existing) =>
          !activePrograms.some((active) => active.id === existing.id),
      ),
    ]);
    setEditForm({
      name: student.name,
      phone: student.phone || "",
      guardianName: student.guardianName || "",
      guardianPhone: student.guardianPhone || "",
      classId: "",
    });
    setEditProgramEnrollments(
      (detail.programEnrollments || []).map((enrollment) => ({
        programId: enrollment.programId,
        classId: enrollment.classId || enrollment.class?.id || null,
      })),
    );
    setEditingStudent(student);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStudent) return;
    const phone = editForm.phone.replace(/\D/g, "");
    if (!editForm.name.trim()) return setEditError("Nama siswa wajib diisi.");
    if (!phone) return setEditError("Nomor telepon wajib diisi.");
    if (phone.length > 13)
      return setEditError("Nomor telepon maksimal 13 digit.");
    if (!validateProgram(editProgramEnrollments)) {
      setEditError("Lengkapi program belajar siswa.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await api.put(`/students/${editingStudent.id}`, {
        ...editForm,
        name: editForm.name.trim(),
        phone,
        programEnrollments: editProgramEnrollments,
      });
      setEditingStudent(null);
      setSuccessMessage("Data siswa berhasil diperbarui.");
      await load();
    } catch (err: any) {
      setEditError(
        err.response?.data?.message || "Gagal memperbarui data siswa.",
      );
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div>
      <nav
        aria-label="Breadcrumb"
        className="mb-3 flex items-center gap-2 text-xs font-medium text-gray-400"
      >
        <span>Admin</span>
        <span aria-hidden="true">/</span>
        <span className="text-gray-600">Data Siswa</span>
      </nav>
      <PageHeader
        title="Siswa"
        description="Kelola data siswa dan program belajar."
        action={
          <button
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-navy-800"
          >
            <IconPlus className="h-4 w-4" />
            Tambah Siswa
          </button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatCard
          label="Total Siswa"
          value={students.length}
          icon={<IconClasses className="h-5 w-5" />}
        />
        <StatCard
          label="Total Program Diikuti"
          value={students.reduce(
            (total, student) => total + student.programEnrollments.length,
            0,
          )}
          icon={<IconClasses className="h-5 w-5" />}
        />
      </div>

      <div className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1 lg:max-w-xl">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari kode, nama, atau nomor telepon siswa"
              aria-label="Cari nama siswa"
              className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100"
            />
          </div>
          <select
            value={programFilter}
            onChange={(event) => setProgramFilter(event.target.value)}
            disabled={programOptions.length === 0}
            aria-label="Filter program"
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="ALL">
              {programOptions.length === 0
                ? "Program belum tersedia"
                : "Semua Program"}
            </option>
            {programOptions
              .filter((program) => program.isActive)
              .map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter status siswa"
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100"
          >
            <option value="ALL">Semua Status</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Nama Siswa</th>
              <th className="px-4 py-3">Program</th>
              <th className="px-4 py-3">Kelas</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-5 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-gray-400"
                >
                  Memuat...
                </td>
              </tr>
            ) : visibleStudents.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-gray-400"
                >
                  {students.length === 0
                    ? "Belum ada data siswa."
                    : "Tidak ada siswa yang sesuai dengan filter."}
                </td>
              </tr>
            ) : (
              visibleStudents.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-slate-50/70"
                >
                  <td className="px-5 py-3.5 text-gray-900">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-100 text-[11px] font-semibold text-navy-700">
                        {initials(s.name)}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/admin/students/${s.id}`}
                          className="font-medium text-gray-900 hover:text-navy-700"
                        >
                          {s.name}
                        </Link>
                        <p className="mt-0.5 text-xs font-semibold text-navy-700">
                          {s.studentCode}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {s.phone || "Kontak belum tersedia"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    {s.programEnrollments.length === 0 ? (
                      <span className="text-xs text-gray-400">
                        Belum ada program
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {s.programEnrollments.map((enrollment) => (
                          <span
                            key={enrollment.programId}
                            className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800"
                          >
                            {enrollment.program?.name || "Program"}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-600">
                    {s.programEnrollments.length
                      ? s.programEnrollments.map((enrollment) => (
                          <p key={enrollment.programId}>
                            {enrollment.class?.name || "Individual"}
                          </p>
                        ))
                      : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <AdminTableActions
                      ariaLabel={`Aksi ${s.name}`}
                      detailHref={`/admin/students/${s.id}`}
                      onEdit={() => openEdit(s)}
                      onManage={() => openPackages(s)}
                      onDelete={() => {
                        setDeleteAcknowledged(false);
                        setDeleteTarget(s);
                      }}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {successMessage && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
        >
          {successMessage}
        </p>
      )}
      {actionError && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {actionError}
        </p>
      )}

      {showForm && (
        <Modal
          title="Tambah Siswa"
          onClose={closeCreateForm}
          className="max-w-3xl"
        >
          <form onSubmit={handleCreate} className="space-y-5">
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-gray-900">
                  Informasi Siswa
                </h2>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  Lengkapi informasi di bawah ini untuk menambahkan siswa baru
                  ke dalam sistem.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="student-name"
                    className="mb-1.5 block text-xs font-medium text-gray-700"
                  >
                    Nama Siswa{" "}
                    <span className="text-red-600" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <input
                    id="student-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    aria-invalid={Boolean(formError)}
                    required
                    disabled={saving || Boolean(createdStudentId)}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="Masukkan nama siswa"
                  />
                </div>
                <div>
                  <label
                    htmlFor="student-phone"
                    className="mb-1.5 block text-xs font-medium text-gray-700"
                  >
                    Nomor Telepon{" "}
                    <span className="text-red-600" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <input
                    id="student-phone"
                    value={form.phone}
                    onChange={(e) => {
                      const value = e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 13);
                      setForm({ ...form, phone: value });
                      setPhoneError(
                        value ? null : "Nomor telepon wajib diisi.",
                      );
                    }}
                    inputMode="numeric"
                    maxLength={13}
                    required
                    aria-invalid={Boolean(phoneError)}
                    disabled={saving || Boolean(createdStudentId)}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="Contoh: 081234567890"
                  />
                  {phoneError && (
                    <p role="alert" className="mt-1 text-xs text-red-700">
                      {phoneError}
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="guardian-name"
                    className="mb-1.5 block text-xs font-medium text-gray-700"
                  >
                    Nama Orang Tua/Wali
                  </label>
                  <input
                    id="guardian-name"
                    value={form.guardianName}
                    onChange={(e) =>
                      setForm({ ...form, guardianName: e.target.value })
                    }
                    disabled={saving || Boolean(createdStudentId)}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="Masukkan nama orang tua/wali"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label
                    htmlFor="guardian-phone"
                    className="mb-1.5 block text-xs font-medium text-gray-700"
                  >
                    Telepon Orang Tua/Wali
                  </label>
                  <input
                    id="guardian-phone"
                    value={form.guardianPhone}
                    onChange={(e) =>
                      setForm({ ...form, guardianPhone: e.target.value })
                    }
                    disabled={saving || Boolean(createdStudentId)}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="Masukkan nomor telepon orang tua/wali"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-gray-900">
                  Program Belajar
                </h2>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  Pilih satu atau beberapa program yang diikuti siswa.
                </p>
              </div>
              <fieldset disabled={saving || Boolean(createdStudentId)}>
                <legend className="sr-only">Pilih program belajar</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {programOptions.map((option) => (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                        programEnrollments.some(
                          (item) => item.programId === option.id,
                        )
                          ? "border-navy-600 bg-navy-50 ring-1 ring-navy-600"
                          : "border-gray-200 hover:border-gray-300"
                      } ${saving || createdStudentId ? "cursor-not-allowed opacity-70" : ""}`}
                    >
                      <input
                        type="checkbox"
                        value={option.id}
                        checked={programEnrollments.some(
                          (item) => item.programId === option.id,
                        )}
                        onChange={() => {
                          setProgramEnrollments((current) =>
                            current.some((item) => item.programId === option.id)
                              ? current.filter(
                                  (item) => item.programId !== option.id,
                                )
                              : [
                                  ...current,
                                  { programId: option.id, classId: null },
                                ],
                          );
                          setProgramError(null);
                        }}
                        className="mt-0.5 h-4 w-4 border-gray-300 text-navy-700 focus:ring-navy-500"
                      />
                      <span>
                        <span className="block text-sm font-medium text-gray-900">
                          {option.name}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-gray-500">
                          {option.learningModel === "CLASS_BASED"
                            ? "Berbasis Kelas"
                            : "Individual"}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <ProgramClassSelectors
                programs={programOptions}
                classes={classes}
                enrollments={programEnrollments}
                disabled={saving || Boolean(createdStudentId) || classesLoading}
                onChange={(programId, classId) => {
                  setProgramEnrollments((current) =>
                    current.map((item) =>
                      item.programId === programId
                        ? { ...item, classId }
                        : item,
                    ),
                  );
                  setProgramError(null);
                }}
              />
              {false && (
                <div className="mt-4">
                  {programEnrollments.some(
                    (item) =>
                      programOptions.find(
                        (option) => option.id === item.programId,
                      )?.learningModel === "CLASS_BASED",
                  ) ? (
                    <div>
                      <label
                        htmlFor="regular-class"
                        className="mb-1.5 block text-xs font-medium text-gray-700"
                      >
                        Kelas Program{" "}
                        <span className="text-gray-400">(opsional)</span>
                      </label>
                      <select
                        id="regular-class"
                        value={selectedClassId}
                        onChange={(e) => {
                          setSelectedClassId(e.target.value);
                          const classProgram = programEnrollments.find(
                            (item) =>
                              programOptions.find(
                                (option) => option.id === item.programId,
                              )?.learningModel === "CLASS_BASED",
                          );
                          if (classProgram)
                            setProgramEnrollments((current) =>
                              current.map((item) =>
                                item.programId === classProgram.programId
                                  ? { ...item, classId: e.target.value || null }
                                  : item,
                              ),
                            );
                          setProgramError(null);
                        }}
                        disabled={
                          saving || Boolean(createdStudentId) || classesLoading
                        }
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100 disabled:bg-gray-50 disabled:text-gray-500"
                      >
                        <option value="">
                          {classesLoading
                            ? "Memuat kelas..."
                            : classes.length
                              ? "Belum ditentukan"
                              : "Belum ada kelas tersedia"}
                        </option>
                        {classes.map((kelas) => (
                          <option key={kelas.id} value={kelas.id}>
                            {kelas.name}
                            {kelas.subject?.name
                              ? ` — ${kelas.subject.name}`
                              : ""}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-xs text-gray-500">
                        Siswa dapat ditempatkan ke kelas nanti melalui Edit
                        Siswa.
                      </p>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-navy-100 bg-navy-50 px-3 py-2 text-xs text-navy-800">
                      Program individual tidak memerlukan kelas.
                    </p>
                  )}
                  {programError && (
                    <p role="alert" className="mt-2 text-xs text-red-700">
                      {programError}
                    </p>
                  )}
                </div>
              )}
            </section>

            {formError && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
              >
                {formError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeCreateForm}
                disabled={saving}
                className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-10 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Menyimpan..." : "Simpan Siswa"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {pkgStudent && (
        <Modal
          title={`Kelola Paket Privat — ${pkgStudent.name}`}
          onClose={() => {
            setPkgStudent(null);
            setPackageConfirm(null);
          }}
        >
          {pkgLoading ? (
            <p className="text-sm text-gray-400">Memuat...</p>
          ) : (
            <>
              {pkgError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">
                  {pkgError}
                </p>
              )}

              {activePackage ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-900">
                        Sisa Pertemuan
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${activePackage.quotaRemaining === 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}
                      >
                        {activePackage.quotaRemaining === 0
                          ? "Habis"
                          : (PACKAGE_STATUS_LABELS[activePackage.status] ??
                            activePackage.status)}
                      </span>
                    </div>
                    <p className="text-2xl font-semibold text-navy-900">
                      {activePackage.quotaRemaining}{" "}
                      <span className="text-sm font-normal text-gray-500">
                        / {activePackage.quotaTotal}
                      </span>
                    </p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full bg-navy-700"
                        style={{
                          width: `${Math.max(0, Math.min(100, (activePackage.quotaRemaining / activePackage.quotaTotal) * 100))}%`,
                        }}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <p className="text-gray-600">
                        Digunakan:
                        <br />
                        <strong className="text-gray-900">
                          {activePackage.quotaUsed} pertemuan
                        </strong>
                      </p>
                      <p className="text-gray-600">
                        Sisa:
                        <br />
                        <strong className="text-gray-900">
                          {activePackage.quotaRemaining} pertemuan
                        </strong>
                      </p>
                    </div>
                  </div>
                  {packageConfirm === "EXTEND" ? (
                    <div className="rounded-lg border border-navy-200 bg-navy-50 p-3 text-sm text-navy-900">
                      <p className="font-semibold">Tambah Pertemuan Privat?</p>
                      <p className="mt-1 text-xs">
                        {pkgStudent.name} akan mendapatkan tambahan 24
                        pertemuan.
                      </p>
                      <p className="mt-2 text-xs">
                        Sisa saat ini:{" "}
                        <strong>{activePackage.quotaRemaining}</strong>
                        <br />
                        Setelah ditambahkan:{" "}
                        <strong>{activePackage.quotaRemaining + 24}</strong>
                      </p>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          onClick={() => setPackageConfirm(null)}
                          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs"
                        >
                          Batal
                        </button>
                        <button
                          onClick={() => extendActivePackage(activePackage.id)}
                          disabled={pkgBusy}
                          className="rounded-md bg-navy-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                        >
                          {pkgBusy ? "Memproses..." : "Tambah 24 Pertemuan"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPackageConfirm("EXTEND")}
                      className="w-full rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800"
                    >
                      + Tambah 24 Pertemuan
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">
                    Belum ada paket privat aktif untuk siswa ini.
                  </p>
                  <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
                    <p className="font-semibold text-gray-900">Paket Privat</p>
                    <p className="mt-1 text-lg font-semibold text-navy-900">
                      24 Pertemuan
                    </p>
                    <p className="mt-2 text-xs leading-5 text-gray-600">
                      Aktifkan paket awal untuk memberikan 24 sesi privat kepada
                      siswa.
                    </p>
                  </div>
                  {packageConfirm === "ACTIVATE" ? (
                    <div className="rounded-lg border border-navy-200 bg-navy-50 p-3 text-sm text-navy-900">
                      <p className="font-semibold">Aktifkan Paket Privat?</p>
                      <p className="mt-1 text-xs">
                        {pkgStudent.name} akan mendapatkan 24 pertemuan privat.
                      </p>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          onClick={() => setPackageConfirm(null)}
                          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs"
                        >
                          Batal
                        </button>
                        <button
                          onClick={activatePackage}
                          disabled={pkgBusy}
                          className="rounded-md bg-navy-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                        >
                          {pkgBusy ? "Memproses..." : "Aktifkan 24 Pertemuan"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPackageConfirm("ACTIVATE")}
                      className="w-full rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800"
                    >
                      Aktifkan Paket 24 Pertemuan
                    </button>
                  )}
                </div>
              )}

              {packages.length > 0 && (
                <div className="mt-5 border-t border-gray-200 pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Riwayat Paket
                  </p>
                  <ul className="space-y-2">
                    {packages.map((p) => (
                      <li key={p.id} className="text-xs text-gray-600">
                        <strong className="text-gray-800">
                          {p.packageName || "Paket Privat"}
                        </strong>{" "}
                        · {p.quotaTotal} pertemuan · aktif sejak{" "}
                        {formatDate(p.activationDate)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {editingStudent && (
        <Modal
          title="Edit Siswa"
          onClose={() => !editSaving && setEditingStudent(null)}
          className="max-w-xl"
        >
          <form onSubmit={saveEdit} className="space-y-5">
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">
                Informasi Siswa
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2 text-xs font-medium text-gray-700">
                  Kode Siswa
                  <input
                    value={editingStudent.studentCode}
                    disabled
                    className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 bg-slate-50 px-3 text-sm font-normal text-gray-500"
                  />
                </label>
                <label className="sm:col-span-2 text-xs font-medium text-gray-700">
                  Nama Siswa
                  <input
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, name: e.target.value })
                    }
                    disabled={editSaving}
                    className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm font-normal text-gray-900 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100"
                  />
                </label>
                <label className="text-xs font-medium text-gray-700">
                  Nomor Telepon Siswa <span className="text-red-600">*</span>
                  <input
                    value={editForm.phone}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        phone: e.target.value.replace(/\D/g, "").slice(0, 13),
                      })
                    }
                    inputMode="numeric"
                    maxLength={13}
                    required
                    disabled={editSaving}
                    className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm font-normal text-gray-900 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100"
                  />
                </label>
                <label className="text-xs font-medium text-gray-700">
                  Nama Orang Tua / Wali
                  <input
                    value={editForm.guardianName}
                    onChange={(e) =>
                      setEditForm({ ...editForm, guardianName: e.target.value })
                    }
                    disabled={editSaving}
                    className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm font-normal text-gray-900 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100"
                  />
                </label>
                <label className="sm:col-span-2 text-xs font-medium text-gray-700">
                  Nomor Telepon Orang Tua / Wali
                  <input
                    value={editForm.guardianPhone}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        guardianPhone: e.target.value.replace(/\D/g, ""),
                      })
                    }
                    inputMode="numeric"
                    disabled={editSaving}
                    className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm font-normal text-gray-900 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100"
                  />
                </label>
              </div>
            </section>
            <ProgramEnrollmentFields
              programs={programOptions}
              classes={classes}
              enrollments={editProgramEnrollments}
              disabled={editSaving}
              classesLoading={classesLoading}
              error={programError}
              onChange={(enrollments) => {
                setEditProgramEnrollments(enrollments);
                setProgramError(null);
              }}
            />
            {false && (
              <section className="rounded-xl border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-gray-900">
                  Penempatan Kelas Reguler
                </h2>
                <label className="mt-3 block text-xs font-medium text-gray-700">
                  Kelas Reguler{" "}
                  <span className="text-gray-400">(opsional)</span>
                  <select
                    value={editForm.classId}
                    onChange={(e) =>
                      setEditForm({ ...editForm, classId: e.target.value })
                    }
                    disabled={editSaving || classesLoading}
                    className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-normal text-gray-900"
                  >
                    <option value="">
                      {classesLoading
                        ? "Memuat kelas..."
                        : classes.length
                          ? "Belum ditentukan"
                          : "Belum ada kelas tersedia"}
                    </option>
                    {classes.map((kelas) => (
                      <option key={kelas.id} value={kelas.id}>
                        {kelas.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-2 text-xs text-gray-500">
                  Perubahan kelas berlaku untuk penempatan siswa saat ini dan
                  tidak mengubah riwayat sesi sebelumnya.
                </p>
              </section>
            )}
            {editError && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
              >
                {editError}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                disabled={editSaving}
                className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="h-10 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                {editSaving ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="Hapus Siswa Permanen?"
          onClose={() => {
            setDeleteTarget(null);
            setDeleteAcknowledged(false);
          }}
        >
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm leading-6 text-red-900">
              Data siswa &quot;{deleteTarget.name}&quot; akan dihapus secara
              permanen dari sistem.
            </p>
            <p className="mt-2 text-sm leading-6 text-red-800">
              Data terkait seperti program, paket privat, jadwal privat, dan
              riwayat pembelajaran terkait juga dapat ikut terhapus.
            </p>
            <p className="mt-2 text-sm font-semibold text-red-900">
              Tindakan ini tidak dapat dibatalkan.
            </p>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={deleteAcknowledged}
              onChange={(event) => setDeleteAcknowledged(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span>
              Saya memahami bahwa data yang dihapus tidak dapat dikembalikan.
            </span>
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => {
                setDeleteTarget(null);
                setDeleteAcknowledged(false);
              }}
              disabled={busyId === deleteTarget.id}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700"
            >
              Batal
            </button>
            <button
              onClick={deleteStudent}
              disabled={!deleteAcknowledged || busyId === deleteTarget.id}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {busyId === deleteTarget.id ? "Menghapus..." : "Hapus Permanen"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
