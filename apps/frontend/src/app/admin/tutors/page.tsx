"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import Modal from "@/components/Modal";
import PageHeader from "@/components/PageHeader";
import SectionCard from "@/components/SectionCard";
import EmptyState from "@/components/EmptyState";
import { IconPlus, IconSearch } from "@/components/icons";
type Subject = { id: string; name: string; isActive: boolean };
type TutorSubject = { subject: Pick<Subject, "id" | "name"> };
type Tutor = {
  id: string;
  name: string;
  phone: string | null;
  title: string | null;
  subjects: TutorSubject[];
  user: { email: string; isActive: boolean; lastLogin: string | null };
};
const initial = {
  name: "",
  title: "",
  phone: "",
  email: "",
  password: "",
  subjectIds: [] as string[],
};
export default function AdminTutorsPage() {
  const [tutors, setTutors] = useState<Tutor[]>([]),
    [subjects, setSubjects] = useState<Subject[]>([]),
    [loading, setLoading] = useState(true),
    [subjectLoading, setSubjectLoading] = useState(false),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [form, setForm] = useState(initial),
    [query, setQuery] = useState(""),
    [formError, setFormError] = useState(""),
    [saving, setSaving] = useState(false),
    [menuTutorId, setMenuTutorId] = useState<string | null>(null),
    [removing, setRemoving] = useState<Tutor | null>(null),
    [deleteError, setDeleteError] = useState(""),
    [deleting, setDeleting] = useState(false),
    [deleteSuccess, setDeleteSuccess] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTutors((await api.get("/tutors")).data.data);
    } catch {
      setError("Gagal memuat data tentor.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  async function openCreate() {
    setForm(initial);
    setFormError("");
    setOpen(true);
    setSubjectLoading(true);
    try {
      setSubjects(
        (await api.get("/subjects")).data.data.filter(
          (s: Subject) => s.isActive,
        ),
      );
    } catch {
      setFormError("Gagal memuat mata pelajaran.");
    } finally {
      setSubjectLoading(false);
    }
  }
  function toggle(id: string) {
    setForm((f) => ({
      ...f,
      subjectIds: f.subjectIds.includes(id)
        ? f.subjectIds.filter((x) => x !== id)
        : [...f.subjectIds, id],
    }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim() || !form.email || form.password.length < 6)
      return setFormError(
        "Nama, email, dan password minimal 6 karakter wajib diisi.",
      );
    if (!form.subjectIds.length)
      return setFormError("Pilih minimal satu mata pelajaran.");
    setSaving(true);
    try {
      await api.post("/tutors", form);
      setOpen(false);
      setForm(initial);
      await load();
    } catch (err: any) {
      setFormError(err.response?.data?.message || "Gagal menambah tentor.");
    } finally {
      setSaving(false);
    }
  }
  async function removeTutor() {
    if (!removing) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await api.delete(`/tutors/${removing.id}`);
      setRemoving(null);
      setDeleteSuccess(
        `${removing.name} berhasil dihapus dari daftar pengajar aktif.`,
      );
      await load();
    } catch (err: any) {
      setDeleteError(err.response?.data?.message || "Gagal menghapus tentor.");
    } finally {
      setDeleting(false);
    }
  }
  const visible = useMemo(
    () =>
      tutors.filter((t) =>
        `${t.name} ${t.user.email}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [tutors, query],
  );
  const selected = subjects.filter((s) => form.subjectIds.includes(s.id));
  return (
    <div className="space-y-5">
      <PageHeader
        title="Tentor"
        description="Kelola data dan informasi pengajar Pioner Class."
        action={
          <button
            onClick={openCreate}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white"
          >
            <IconPlus className="h-4 w-4" />
            Tambah Tentor
          </button>
        }
      />
      <SectionCard
        title="Data Tentor"
        description={`${tutors.length} tentor terdaftar.`}
      >
        {deleteSuccess && (
          <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            {deleteSuccess}
          </p>
        )}
        {error ? (
          <EmptyState message={error} />
        ) : (
          <>
            <div className="relative mb-4">
              <IconSearch className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama atau email tentor"
                className="h-10 w-full rounded-lg border pl-9 pr-3 text-sm"
              />
            </div>
            {loading ? (
              <p className="py-8 text-center text-sm text-gray-400">
                Memuat...
              </p>
            ) : !visible.length ? (
              <EmptyState
                title="Belum ada tentor"
                message="Tambahkan tentor untuk mulai mengelola pengajar."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-gray-500">
                    <tr>
                      <th className="p-3">Tentor</th>
                      <th>Email</th>
                      <th>No. Telepon</th>
                      <th>Login Terakhir</th>
                      <th className="p-3">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((t) => (
                      <tr key={t.id} className="border-t">
                        <td className="p-3 font-medium">{t.name}</td>
                        <td>{t.user.email}</td>
                        <td>{t.phone || "-"}</td>
                        <td>
                          {t.user.lastLogin
                            ? new Intl.DateTimeFormat("id-ID", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              }).format(new Date(t.user.lastLogin))
                            : "Belum pernah login"}
                        </td>
                        <td className="p-3">
                          <Link
                            href={`/admin/tutors/${t.id}`}
                            className="mr-3 text-xs text-blue-600"
                          >
                            Detail
                          </Link>
                          <Link
                            href={`/admin/tutors/${t.id}/edit`}
                            className="mr-3 text-xs text-blue-600"
                          >
                            Edit
                          </Link>
                          <span className="relative inline-block">
                            <button
                              aria-label={`Aksi untuk ${t.name}`}
                              aria-expanded={menuTutorId === t.id}
                              onClick={() =>
                                setMenuTutorId(
                                  menuTutorId === t.id ? null : t.id,
                                )
                              }
                              className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-slate-100"
                            >
                              ⋮
                            </button>
                            {menuTutorId === t.id && (
                              <button
                                onClick={() => {
                                  setDeleteError("");
                                  setMenuTutorId(null);
                                  setRemoving(t);
                                }}
                                className="absolute right-0 z-10 mt-1 w-32 rounded-lg border bg-white px-3 py-2 text-left text-xs text-red-600 shadow-lg"
                              >
                                Hapus Tentor
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </SectionCard>
      {open && (
        <Modal title="Tambah Tentor" onClose={() => !saving && setOpen(false)}>
          <form onSubmit={submit} className="space-y-3">
            <Input
              label="Nama *"
              value={form.name}
              change={(v) => setForm({ ...form, name: v })}
            />
            <Input
              label="Gelar (opsional)"
              value={form.title}
              change={(v) => setForm({ ...form, title: v })}
            />
            <Input
              label="No. Telepon"
              value={form.phone}
              change={(v) => setForm({ ...form, phone: v })}
            />
            <Input
              label="Email *"
              value={form.email}
              type="email"
              change={(v) => setForm({ ...form, email: v })}
            />
            <div>
              <label className="text-sm font-medium">
                Mata Pelajaran yang Diajar *
              </label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari mata pelajaran..."
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              />
              <div className="mt-2 max-h-36 overflow-y-auto rounded border">
                {subjectLoading ? (
                  <p className="p-3 text-sm text-gray-400">
                    Memuat mata pelajaran...
                  </p>
                ) : subjects.length ? (
                  subjects
                    .filter((s) =>
                      s.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 border-b px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={form.subjectIds.includes(s.id)}
                          onChange={() => toggle(s.id)}
                        />
                        {s.name}
                      </label>
                    ))
                ) : (
                  <p className="p-3 text-sm text-gray-500">
                    Belum ada mata pelajaran. Tambahkan melalui Kelas & Mapel
                    terlebih dahulu.
                  </p>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {selected.length
                  ? selected.map((s) => s.name).join(", ")
                  : "Belum ada mata pelajaran dipilih."}
              </p>
            </div>
            <Input
              label="Password *"
              value={form.password}
              type="password"
              change={(v) => setForm({ ...form, password: v })}
            />
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border px-4 py-2 text-sm"
              >
                Batal
              </button>
              <button
                disabled={saving || subjectLoading}
                className="rounded bg-navy-900 px-4 py-2 text-sm text-white"
              >
                {saving ? "Menyimpan..." : "Simpan Tentor"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal
          title="Hapus Tentor"
          onClose={() => !deleting && setRemoving(null)}
        >
          <div className="space-y-4 text-sm text-gray-600">
            <p>
              Anda akan menghapus <strong>{removing.name}</strong> dari daftar
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
                type="button"
                disabled={deleting}
                onClick={() => setRemoving(null)}
                className="rounded border px-4 py-2"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={removeTutor}
                className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-60"
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
function Input({
  label,
  value,
  change,
  type = "text",
}: {
  label: string;
  value: string;
  change: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => change(e.target.value)}
        className="mt-1 h-10 w-full rounded border px-3"
      />
    </label>
  );
}
