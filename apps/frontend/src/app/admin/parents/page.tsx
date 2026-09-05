"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import Modal from "@/components/Modal";
import PageHeader from "@/components/PageHeader";
import SectionCard from "@/components/SectionCard";
import EmptyState from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { IconPlus, IconParent } from "@/components/icons";
import AdminTableActions from "@/components/TableActionMenu";

interface StudentOption {
  id: string;
  name: string;
  studentCode: string;
}

interface ParentRow {
  id: string;
  parentCode: string;
  name: string;
  phone: string | null;
  user: { email: string; isActive: boolean; lastLogin: string | null };
  children: Array<{
    relationship: string | null;
    student: { id: string; name: string; studentCode: string };
  }>;
}

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 disabled:bg-gray-50 disabled:text-gray-500";

export default function AdminParentsPage() {
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailParent, setDetailParent] = useState<ParentRow | null>(null);
  const [editingParent, setEditingParent] = useState<ParentRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "" });
  const [editError, setEditError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    studentIds: [] as string[],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [parentsRes, studentsRes] = await Promise.all([
        api.get("/parents"),
        api.get("/students"),
      ]);
      setParents(parentsRes.data.data);
      setStudents(
        studentsRes.data.data.map((s: any) => ({ id: s.id, name: s.name })),
      );
    } catch {
      setActionError("Gagal memuat data orang tua.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setForm({ name: "", email: "", password: "", phone: "", studentIds: [] });
    setFormError(null);
  }

  function toggleStudent(id: string) {
    setForm((f) =>
      f.studentIds.includes(id)
        ? { ...f, studentIds: f.studentIds.filter((s) => s !== id) }
        : { ...f, studentIds: [...f.studentIds, id] },
    );
  }

  async function handleCreate() {
    setFormError(null);
    if (!form.name.trim()) return setFormError("Nama wajib diisi.");
    if (!form.email.trim()) return setFormError("Email wajib diisi.");
    if (form.password.length < 6)
      return setFormError("Password minimal 6 karakter.");
    if (form.studentIds.length === 0)
      return setFormError("Pilih minimal satu siswa (anak).");

    setSaving(true);
    try {
      await api.post("/parents", {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone || undefined,
        studentIds: form.studentIds,
      });
      setShowForm(false);
      resetForm();
      await load();
    } catch (err: any) {
      setFormError(
        err.response?.data?.message || "Gagal membuat akun orang tua.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(parent: ParentRow) {
    setActionError(null);
    setBusyId(parent.id);
    try {
      const action = parent.user.isActive ? "deactivate" : "activate";
      await api.patch(`/parents/${parent.id}/${action}`);
      await load();
    } catch (err: any) {
      setActionError(
        err.response?.data?.message || "Gagal mengubah status akun.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function openDetail(parent: ParentRow) {
    setActionError(null);
    setBusyId(parent.id);
    try {
      const response = await api.get(`/parents/${parent.id}`);
      setDetailParent(response.data.data);
    } catch (err: any) {
      setActionError(
        err.response?.data?.message || "Gagal memuat detail orang tua.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function openEdit(parent: ParentRow) {
    setEditError(null);
    setBusyId(parent.id);
    try {
      const response = await api.get(`/parents/${parent.id}`);
      const data = response.data.data as ParentRow;
      setEditingParent(data);
      setEditForm({ name: data.name, phone: data.phone || "" });
    } catch (err: any) {
      setActionError(
        err.response?.data?.message || "Gagal memuat data orang tua.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit() {
    if (!editingParent) return;
    if (!editForm.name.trim()) return setEditError("Nama wajib diisi.");

    setEditError(null);
    setSaving(true);
    try {
      await api.put(`/parents/${editingParent.id}`, {
        name: editForm.name.trim(),
        phone: editForm.phone || undefined,
      });
      setEditingParent(null);
      await load();
    } catch (err: any) {
      setEditError(
        err.response?.data?.message || "Gagal memperbarui akun orang tua.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Orang Tua"
        description="Kelola akun orang tua/wali dan siswa yang terhubung ke akun mereka."
        action={
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800"
          >
            <IconPlus className="h-4 w-4" />
            Tambah Orang Tua
          </button>
        }
      />

      {actionError && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      )}

      <SectionCard>
        {loading ? (
          <p className="py-6 text-center text-sm text-gray-400">Memuat...</p>
        ) : parents.length === 0 ? (
          <EmptyState
            icon={<IconParent className="h-4 w-4" />}
            title="Belum ada akun orang tua"
            message="Klik 'Tambah Orang Tua' untuk membuat akun pertama."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-slate-50 text-left text-xs font-medium text-gray-500">
                  <th className="px-4 py-3 font-medium">Kode / Nama</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Anak</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {parents.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-gray-100 last:border-0 hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <span className="block text-xs font-semibold text-navy-700">
                        {p.parentCode}
                      </span>
                      {p.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.user.email}</td>
                    <td className="px-4 py-3">
                      {p.children.length === 0 ? (
                        <span className="text-xs text-gray-400">
                          Belum ada anak terhubung
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {p.children.map((c) => (
                            <span
                              key={c.student.id}
                              className="rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-800"
                            >
                              {c.student.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={p.user.isActive ? "ACTIVE" : "INACTIVE"}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1 whitespace-nowrap">
                        <AdminTableActions
                          ariaLabel={`Aksi untuk ${p.name}`}
                          onDetail={() => openDetail(p)}
                          onEdit={() => openEdit(p)}
                        />
                        <button
                          onClick={() => toggleActive(p)}
                          disabled={busyId === p.id}
                          className="rounded-md px-2 py-1 text-xs font-medium text-navy-700 hover:bg-navy-50 hover:text-navy-900 disabled:opacity-50"
                        >
                          {busyId === p.id
                            ? "Memproses..."
                            : p.user.isActive
                              ? "Nonaktifkan"
                              : "Aktifkan"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {showForm && (
        <Modal title="Tambah Orang Tua" onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            {formError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}
            <div>
              <label
                htmlFor="parent-name"
                className="mb-1.5 block text-xs font-medium text-gray-700"
              >
                Nama Orang Tua <span className="text-red-600">*</span>
              </label>
              <input
                id="parent-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={saving}
                className={inputClass}
                placeholder="Masukkan nama orang tua"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="parent-email"
                  className="mb-1.5 block text-xs font-medium text-gray-700"
                >
                  Email <span className="text-red-600">*</span>
                </label>
                <input
                  id="parent-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={saving}
                  className={inputClass}
                  placeholder="ortu@email.com"
                />
              </div>
              <div>
                <label
                  htmlFor="parent-password"
                  className="mb-1.5 block text-xs font-medium text-gray-700"
                >
                  Password <span className="text-red-600">*</span>
                </label>
                <input
                  id="parent-password"
                  type="text"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  disabled={saving}
                  className={inputClass}
                  placeholder="Minimal 6 karakter"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="parent-phone"
                className="mb-1.5 block text-xs font-medium text-gray-700"
              >
                Nomor Telepon (opsional)
              </label>
              <input
                id="parent-phone"
                value={form.phone}
                onChange={(e) =>
                  setForm({
                    ...form,
                    phone: e.target.value.replace(/\D/g, "").slice(0, 13),
                  })
                }
                inputMode="numeric"
                disabled={saving}
                className={inputClass}
                placeholder="Contoh: 081234567890"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Hubungkan ke Siswa (Anak){" "}
                <span className="text-red-600">*</span>
              </label>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-300 p-2">
                {students.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-gray-400">
                    Belum ada data siswa.
                  </p>
                ) : (
                  students.map((s) => (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={form.studentIds.includes(s.id)}
                        onChange={() => toggleStudent(s.id)}
                        disabled={saving}
                        className="h-4 w-4 rounded border-gray-300 text-navy-700 focus:ring-navy-500"
                      />
                      {s.name}
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="h-10 flex-1 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="h-10 flex-1 rounded-lg bg-navy-900 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60"
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {detailParent && (
        <Modal title="Detail Orang Tua" onClose={() => setDetailParent(null)}>
          <div className="space-y-3 text-sm text-gray-700">
            <div>
              <span className="text-gray-500">Kode Orang Tua</span>
              <p className="font-medium text-navy-800">
                {detailParent.parentCode}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Nama</span>
              <p className="font-medium text-gray-900">{detailParent.name}</p>
            </div>
            <div>
              <span className="text-gray-500">Email</span>
              <p>{detailParent.user.email}</p>
            </div>
            <div>
              <span className="text-gray-500">No. Telepon</span>
              <p>{detailParent.phone || "-"}</p>
            </div>
            <div>
              <span className="text-gray-500">Anak</span>
              <p>
                {detailParent.children
                  .map((child) => child.student.name)
                  .join(", ") || "-"}
              </p>
            </div>
          </div>
        </Modal>
      )}

      {editingParent && (
        <Modal
          title="Edit Orang Tua"
          onClose={() => !saving && setEditingParent(null)}
        >
          <div className="space-y-4">
            {editError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {editError}
              </p>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Kode Orang Tua
              </label>
              <input
                value={editingParent.parentCode}
                disabled
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Nama <span className="text-red-600">*</span>
              </label>
              <input
                value={editForm.name}
                onChange={(event) =>
                  setEditForm({ ...editForm, name: event.target.value })
                }
                disabled={saving}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Nomor Telepon
              </label>
              <input
                value={editForm.phone}
                onChange={(event) =>
                  setEditForm({
                    ...editForm,
                    phone: event.target.value.replace(/\D/g, "").slice(0, 13),
                  })
                }
                inputMode="numeric"
                disabled={saving}
                className={inputClass}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setEditingParent(null)}
                disabled={saving}
                className="h-10 flex-1 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="h-10 flex-1 rounded-lg bg-navy-900 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60"
              >
                {saving ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
